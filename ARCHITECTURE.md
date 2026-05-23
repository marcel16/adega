# Arquitetura do Sistema Adega

> **SaaS Gerenciador de TVs para Adegas e Mercados**
>
> Versão: 1.0.0 | Data: 2026-05-23

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Schema do Banco de Dados](#2-schema-do-banco-de-dados)
3. [Estrutura de Diretórios](#3-estrutura-de-diretórios)
4. [Design da API REST](#4-design-da-api-rest)
5. [Arquitetura Docker](#5-arquitetura-docker)
6. [Plano de Implementação Faseado](#6-plano-de-implementação-faseado)
7. [Decisões de Arquitetura](#7-decisões-de-arquitetura)

---

## 1. Visão Geral

### 1.1 Diagrama de Subdomínios

```
┌────────────────────────────────────────────────────────────┐
│                      COOLIFY (Docker Host)                  │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ adega.queroservi │  │ admin.adega.     │                 │
│  │ co.com.br        │  │ queroservico...  │                 │
│  │ (Next.js Client) │  │ (Next.js Admin)  │                 │
│  └────────┬─────────┘  └────────┬─────────┘                 │
│           │                     │                            │
│           └──────────┬──────────┘                            │
│                      ▼                                       │
│  ┌──────────────────────────────────────┐                    │
│  │         Backend API (Express)         │                    │
│  │         api.adega.queroservico...     │                    │
│  └──────┬───────────────┬───────────────┘                    │
│         │               │                                    │
│         ▼               ▼                                    │
│  ┌──────────┐   ┌──────────────┐                             │
│  │PostgreSQL│   │  Redis       │                             │
│  │  (DB)    │   │  (Queue/Jobs)│                             │
│  └──────────┘   └──────┬───────┘                             │
│                        │                                      │
│  ┌─────────────────────┼──────────────────────┐              │
│  │                     ▼                       │              │
│  │  ┌──────────────────────────────────┐      │              │
│  │  │        Worker (BullMQ)            │      │              │
│  │  │  ┌────────┐ ┌───────┐ ┌───────┐  │      │              │
│  │  │  │ FFmpeg │ │YouTube│ │ M3U   │  │      │              │
│  │  │  │Process │ │Import │ │Gen    │  │      │              │
│  │  │  └────────┘ └───────┘ └───────┘  │      │              │
│  │  └──────────────────────────────────┘      │              │
│  └────────────────────────────────────────────┘              │
│                                                             │
│  ┌──────────────────────┐                                   │
│  │ tv.adega.queroservi  │  ← M3U Delivery Service           │
│  │ co.com.br            │     (cacheável, alta performance) │
│  └──────────────────────┘                                   │
└────────────────────────────────────────────────────────────┘

                         ┌──────────┐
                         │  ASAAS   │  ← Pagamentos / Webhooks
                         │  API     │
                         └──────────┘
```

### 1.2 Fluxo Principal

```
Cliente (dono de adega)
  │
  ├─ 1. Cria conta em adega.queroservico.com.br
  ├─ 2. Escolhe plano, paga via Asaas
  ├─ 3. Configura branding (logo, marca d'água)
  ├─ 4. Faz upload de mídias (MP4, imagens, sons)
  ├─ 5. Cria promoções com agendamento
  ├─ 6. Associa promoções às TVs
  ├─ 7. Configura TV com URL M3U: tv.adega.queroservico.com.br/tv1-minhaadega.m3u
  │
  ▼
TV do cliente (播放器)
  │
  └─▶ Acessa M3U periodicamente → recebe playlist com promoções agendadas
       └─▶ Player baixa e toca os vídeos/imagens na ordem definida
```

---

## 2. Schema do Banco de Dados

### 2.1 Diagrama Entidade-Relacionamento

```
users ────┐                    admin_users
  │        │                      │
  │   tenants (adegas)            │
  │     │    │                    │
  │     │    ├── tvs              │
  │     │    ├── m3u_playlists    │
  │     │    ├── promotions ──────┤── promotion_media ── media
  │     │    ├── tv_promotions    │
  │     │    ├── branding         │
  │     │    ├── subscriptions ───┤── plans
  │     │    └── payments         │
  │     │                         │
  │     └── notification_settings │── notifications
  │                               │
  └── campaigns ──────────────────┘── campaign_targets
```

### 2.2 SQL Completo

```sql
-- =============================================================================
-- SCHEMA: ADEGA - SaaS Gerenciador de TVs
-- PostgreSQL 15+
-- =============================================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE plan_interval AS ENUM ('monthly', 'yearly');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired', 'trial', 'pending');
CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'overdue', 'refunded', 'cancelled');
CREATE TYPE payment_method AS ENUM ('pix', 'boleto', 'credit_card');
CREATE TYPE media_type AS ENUM ('video', 'image', 'audio');
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'finished');
CREATE TYPE campaign_distribution AS ENUM ('sequential', 'random', 'targeted');
CREATE TYPE notification_level AS ENUM ('info', 'warning', 'critical', 'promotional');
CREATE TYPE watermark_position AS ENUM (
  'top_left', 'top_center', 'top_right',
  'center', 'bottom_left', 'bottom_center', 'bottom_right'
);
CREATE TYPE m3u_stream_type AS ENUM ('live', 'vod', 'playlist');

-- =============================================================================
-- TABELAS PRINCIPAIS
-- =============================================================================

-- ─── USERS (clientes - donos de adega) ──────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  phone           VARCHAR(20),
  cpf_cnpj        VARCHAR(18),
  avatar_url      TEXT,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ─── ADMIN USERS (superadmins do sistema) ───────────────────────────────────
CREATE TABLE admin_users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(50) NOT NULL DEFAULT 'admin', -- admin | superadmin | support
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TENANTS (adegas) ───────────────────────────────────────────────────────
-- Um usuário pode ter múltiplas adegas
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,          -- Nome da adega/mercado
  slug            VARCHAR(100) NOT NULL UNIQUE,    -- usado no M3U: tv1-{slug}.m3u
  status          VARCHAR(20) NOT NULL DEFAULT 'active', -- active | suspended | cancelled
  max_tvs         INTEGER NOT NULL DEFAULT 1,      -- limite de TVs pelo plano
  max_storage_mb  INTEGER NOT NULL DEFAULT 500,    -- limite de storage pelo plano
  used_storage_mb INTEGER NOT NULL DEFAULT 0,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_owner ON tenants(owner_id);
CREATE UNIQUE INDEX idx_tenants_slug ON tenants(slug);

-- ─── PLANS (planos/pacotes) ─────────────────────────────────────────────────
CREATE TABLE plans (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  interval          plan_interval NOT NULL DEFAULT 'monthly',
  price_cents       INTEGER NOT NULL,              -- preço em centavos (R$ 29,90 = 2990)
  max_tvs           INTEGER NOT NULL DEFAULT 1,
  max_storage_mb    INTEGER NOT NULL DEFAULT 500,
  max_promotions    INTEGER NOT NULL DEFAULT 10,
  features          JSONB NOT NULL DEFAULT '[]',   -- ["youtube_import", "campaigns", ...]
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── SUBSCRIPTIONS (assinaturas) ─────────────────────────────────────────────
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id         UUID NOT NULL REFERENCES plans(id),
  status          subscription_status NOT NULL DEFAULT 'pending',
  interval        plan_interval NOT NULL,
  price_cents     INTEGER NOT NULL,               -- snapshot do preço no momento
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end   TIMESTAMPTZ NOT NULL,
  cancelled_at    TIMESTAMPTZ,
  trial_ends_at   TIMESTAMPTZ,
  asaas_subscription_id VARCHAR(100),             -- ID da assinatura no Asaas
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ─── PAYMENTS (pagamentos via Asaas) ─────────────────────────────────────────
CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id   UUID REFERENCES subscriptions(id),
  asaas_payment_id  VARCHAR(100) UNIQUE,
  amount_cents      INTEGER NOT NULL,
  status            payment_status NOT NULL DEFAULT 'pending',
  method            payment_method,
  due_date          DATE,
  paid_at           TIMESTAMPTZ,
  invoice_url       TEXT,
  pix_qr_code       TEXT,
  pix_copy_paste    TEXT,
  billing_type      VARCHAR(20),
  raw_webhook       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_status ON payments(status);

-- ─── TVS (televisores conectados) ────────────────────────────────────────────
CREATE TABLE tvs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,           -- ex: "TV Entrada", "TV 1"
  m3u_slug        VARCHAR(100) NOT NULL,            -- identificador único: "tv1"
  status          VARCHAR(20) NOT NULL DEFAULT 'offline', -- online | offline | disabled
  last_seen_at    TIMESTAMPTZ,
  last_ip         INET,
  user_agent      TEXT,
  player_info     JSONB DEFAULT '{}',              -- info do player que acessou
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, m3u_slug)
);

CREATE INDEX idx_tvs_tenant ON tvs(tenant_id);

-- ─── M3U PLAYLISTS (cache das playlists geradas) ────────────────────────────
CREATE TABLE m3u_playlists (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tv_id           UUID NOT NULL REFERENCES tvs(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,                    -- conteúdo da playlist M3U
  content_hash    VARCHAR(64),                      -- SHA-256 para cache
  version         INTEGER NOT NULL DEFAULT 1,
  item_count      INTEGER NOT NULL DEFAULT 0,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,                      -- TTL do cache
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_m3u_tv ON m3u_playlists(tv_id);
CREATE INDEX idx_m3u_tenant ON m3u_playlists(tenant_id);

-- ─── MEDIA (arquivos de mídia) ──────────────────────────────────────────────
CREATE TABLE media (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  type            media_type NOT NULL,
  original_name   VARCHAR(500) NOT NULL,
  file_path       TEXT NOT NULL,                    -- caminho no storage
  thumbnail_path  TEXT,                             -- thumbnail (vídeos/imagens)
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  duration_secs   INTEGER,                          -- duração (vídeos/áudio)
  width           INTEGER,                          -- resolução (vídeos/imagens)
  height          INTEGER,
  codec           VARCHAR(50),                      -- codec de vídeo
  bitrate_kbps    INTEGER,
  youtube_url     TEXT,                             -- URL original do YouTube
  youtube_id      VARCHAR(20),                      -- ID do vídeo no YouTube
  status          VARCHAR(20) NOT NULL DEFAULT 'processing', -- processing | ready | error
  error_message   TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_tenant ON media(tenant_id);
CREATE INDEX idx_media_type ON media(type);
CREATE INDEX idx_media_status ON media(status);

-- ─── PROMOTIONS (promoções com agendamento) ──────────────────────────────────
CREATE TABLE promotions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | scheduled | active | paused | finished
  priority        INTEGER NOT NULL DEFAULT 0,        -- prioridade (maior = mais importante)
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  schedule_type   VARCHAR(20) NOT NULL DEFAULT 'always', -- always | timerange | days_of_week
  schedule_config JSONB DEFAULT '{}',                  -- { days: [1,3,5], time_start: "08:00", time_end: "22:00" }
  display_duration_secs INTEGER NOT NULL DEFAULT 15,  -- segundos de exibição por ciclo
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_promotions_tenant ON promotions(tenant_id);
CREATE INDEX idx_promotions_status ON promotions(status);
CREATE INDEX idx_promotions_dates ON promotions(starts_at, ends_at);

-- ─── PROMOTION <-> MEDIA (quais mídias compõem uma promoção) ─────────────────
CREATE TABLE promotion_media (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promotion_id    UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  media_id        UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,       -- ordem dentro da promoção
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(promotion_id, media_id)
);

CREATE INDEX idx_pm_promotion ON promotion_media(promotion_id);

-- ─── TV <-> PROMOTIONS (quais promoções cada TV exibe) ───────────────────────
CREATE TABLE tv_promotions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tv_id           UUID NOT NULL REFERENCES tvs(id) ON DELETE CASCADE,
  promotion_id    UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tv_id, promotion_id)
);

CREATE INDEX idx_tp_tv ON tv_promotions(tv_id);

-- ─── BRANDING (logo, marca d'água, identidade visual) ────────────────────────
CREATE TABLE branding (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  logo_url          TEXT,
  watermark_url     TEXT,
  watermark_position watermark_position NOT NULL DEFAULT 'bottom_right',
  watermark_opacity DECIMAL(3,2) NOT NULL DEFAULT 0.70 CHECK (watermark_opacity BETWEEN 0 AND 1),
  watermark_size_pct DECIMAL(3,2) NOT NULL DEFAULT 10.00, -- % da tela
  primary_color     VARCHAR(7) DEFAULT '#1a1a2e',
  secondary_color   VARCHAR(7) DEFAULT '#e94560',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── NOTIFICATION SETTINGS (por tenant) ──────────────────────────────────────
CREATE TABLE notification_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  email_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  payment_alerts  BOOLEAN NOT NULL DEFAULT TRUE,
  system_alerts   BOOLEAN NOT NULL DEFAULT TRUE,
  promo_alerts    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── NOTIFICATIONS ──────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = broadcast
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  body            TEXT NOT NULL,
  level           notification_level NOT NULL DEFAULT 'info',
  read            BOOLEAN NOT NULL DEFAULT FALSE,
  action_url      TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_tenant ON notifications(tenant_id);
CREATE INDEX idx_notif_read ON notifications(tenant_id, read);
CREATE INDEX idx_notif_created ON notifications(created_at DESC);

-- ─── CAMPAIGNS (campanhas do desenvolvedor/superadmin) ───────────────────────
CREATE TABLE campaigns (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by        UUID NOT NULL REFERENCES admin_users(id),
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  status            campaign_status NOT NULL DEFAULT 'draft',
  distribution      campaign_distribution NOT NULL DEFAULT 'random',
  probability_pct   INTEGER NOT NULL DEFAULT 100,   -- % de chance de aparecer (para random)
  display_duration_secs INTEGER NOT NULL DEFAULT 15,
  starts_at         TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,
  schedule_config   JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_status ON campaigns(status);

-- ─── CAMPAIGN TARGETS (quais tenants recebem a campanha) ─────────────────────
CREATE TABLE campaign_targets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(campaign_id, tenant_id)
);

CREATE INDEX idx_ct_campaign ON campaign_targets(campaign_id);
CREATE INDEX idx_ct_tenant ON campaign_targets(tenant_id);

-- ─── CAMPAIGN MEDIA (mídias associadas a campanhas) ──────────────────────────
CREATE TABLE campaign_media (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  file_path       TEXT NOT NULL,
  title           VARCHAR(255),
  type            media_type NOT NULL,
  duration_secs   INTEGER,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cm_campaign ON campaign_media(campaign_id);

-- ─── REFRESH TOKENS ──────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  admin_user_id   UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash      VARCHAR(255) NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (user_id IS NOT NULL OR admin_user_id IS NOT NULL)
);

CREATE INDEX idx_rt_hash ON refresh_tokens(token_hash);

-- ─── STORAGE USAGE LOG (auditoria de armazenamento) ──────────────────────────
CREATE TABLE storage_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  media_id        UUID REFERENCES media(id) ON DELETE SET NULL,
  size_bytes      BIGINT NOT NULL,
  action          VARCHAR(20) NOT NULL,            -- upload | delete
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_storage_tenant ON storage_log(tenant_id);

-- ─── ACTIVITY LOG (registro de ações para auditoria) ─────────────────────────
CREATE TABLE activity_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_user_id   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action          VARCHAR(100) NOT NULL,            -- ex: "tv.created", "payment.confirmed"
  resource_type   VARCHAR(50),                      -- ex: "tv", "payment", "promotion"
  resource_id     UUID,
  details         JSONB DEFAULT '{}',
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_al_tenant ON activity_log(tenant_id);
CREATE INDEX idx_al_created ON activity_log(created_at DESC);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Atualiza `updated_at` automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplica trigger a todas as tabelas com updated_at
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'updated_at' AND table_schema = 'public'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()', tbl
    );
  END LOOP;
END $$;

-- Atualiza `used_storage_mb` do tenant automaticamente
CREATE OR REPLACE FUNCTION update_tenant_storage()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE tenants SET used_storage_mb = (
      SELECT COALESCE(SUM(file_size_bytes), 0) / 1048576.0
      FROM media WHERE tenant_id = NEW.tenant_id
    ) WHERE id = NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE tenants SET used_storage_mb = (
      SELECT COALESCE(SUM(file_size_bytes), 0) / 1048576.0
      FROM media WHERE tenant_id = OLD.tenant_id
    ) WHERE id = OLD.tenant_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_media_storage AFTER INSERT OR DELETE ON media
  FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();

-- Invalida cache M3U quando promoções da TV mudam
CREATE OR REPLACE FUNCTION invalidate_m3u_cache()
RETURNS TRIGGER AS $$
DECLARE
  v_tv_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'tv_promotions' THEN
    v_tv_id := COALESCE(NEW.tv_id, OLD.tv_id);
  ELSIF TG_TABLE_NAME = 'promotions' THEN
    -- Encontra todas as TVs que usam essa promoção
    PERFORM DISTINCT tp.tv_id FROM tv_promotions tp
    WHERE tp.promotion_id = COALESCE(NEW.id, OLD.id);
    RETURN NULL;
  END IF;

  DELETE FROM m3u_playlists WHERE tv_id = v_tv_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_m3u_invalidate_tp AFTER INSERT OR UPDATE OR DELETE ON tv_promotions
  FOR EACH ROW EXECUTE FUNCTION invalidate_m3u_cache();

CREATE TRIGGER trg_m3u_invalidate_promo AFTER UPDATE OF status, starts_at, ends_at, priority ON promotions
  FOR EACH ROW EXECUTE FUNCTION invalidate_m3u_cache();
```

---

## 3. Estrutura de Diretórios

```
adega/
├── docker-compose.yml              # Orquestração Docker (todos os serviços)
├── docker-compose.prod.yml         # Override de produção
├── .env.example                    # Template de variáveis de ambiente
├── .env                            # Variáveis (não commitado)
├── .gitignore
├── .prettierrc
├── .eslintrc.js
├── tsconfig.base.json              # TypeScript config base (compartilhado)
├── package.json                    # Workspace root (pnpm workspaces)
├── pnpm-workspace.yaml
├── Makefile                        # Atalhos: make dev, make build, make migrate
│
├── packages/
│   ├── shared/                     # Tipos, DTOs, validações compartilhadas
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/
│   │       │   ├── user.ts
│   │       │   ├── tenant.ts
│   │       │   ├── tv.ts
│   │       │   ├── media.ts
│   │       │   ├── promotion.ts
│   │       │   ├── plan.ts
│   │       │   ├── payment.ts
│   │       │   ├── campaign.ts
│   │       │   ├── notification.ts
│   │       │   └── api.ts           # Tipos genéricos: PaginatedResponse<T>, ApiError, etc.
│   │       ├── dto/
│   │       │   ├── auth.dto.ts
│   │       │   ├── tenant.dto.ts
│   │       │   ├── tv.dto.ts
│   │       │   ├── media.dto.ts
│   │       │   ├── promotion.dto.ts
│   │       │   ├── plan.dto.ts
│   │       │   ├── payment.dto.ts
│   │       │   └── campaign.dto.ts
│   │       ├── validators/
│   │       │   ├── auth.validator.ts     # Zod schemas
│   │       │   ├── tenant.validator.ts
│   │       │   ├── media.validator.ts
│   │       │   └── promotion.validator.ts
│   │       ├── constants/
│   │       │   ├── plans.ts
│   │       │   └── m3u.ts
│   │       └── utils/
│   │           ├── format.ts
│   │           └── date.ts
│   │
│   ├── backend/                    # API Principal (Express + TypeScript)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nodemon.json
│   │   └── src/
│   │       ├── index.ts             # Entry point: inicia Express + BullMQ workers
│   │       ├── app.ts               # Configuração do Express (middlewares, rotas)
│   │       ├── config/
│   │       │   ├── env.ts            # Variáveis de ambiente tipadas
│   │       │   ├── database.ts       # Pool PostgreSQL (pg)
│   │       │   ├── redis.ts          # Conexão Redis (ioredis)
│   │       │   └── asaas.ts          # Configuração Asaas API
│   │       ├── middleware/
│   │       │   ├── auth.middleware.ts       # JWT + tenant context
│   │       │   ├── admin-auth.middleware.ts # JWT para admins
│   │       │   ├── rate-limit.middleware.ts
│   │       │   ├── error-handler.middleware.ts
│   │       │   ├── request-logger.middleware.ts
│   │       │   ├── tenant-context.middleware.ts  # Extrai tenant do subdomínio
│   │       │   ├── upload.middleware.ts          # Multer + validação
│   │       │   └── validate.middleware.ts        # Zod validation middleware
│   │       ├── modules/             # Arquitetura modular
│   │       │   ├── auth/
│   │       │   │   ├── auth.controller.ts
│   │       │   │   ├── auth.service.ts
│   │       │   │   ├── auth.routes.ts
│   │       │   │   └── auth.strategies.ts       # JWT, refresh token
│   │       │   ├── users/
│   │       │   │   ├── users.controller.ts
│   │       │   │   ├── users.service.ts
│   │       │   │   ├── users.routes.ts
│   │       │   │   └── users.repository.ts
│   │       │   ├── tenants/
│   │       │   │   ├── tenants.controller.ts
│   │       │   │   ├── tenants.service.ts
│   │       │   │   ├── tenants.routes.ts
│   │       │   │   └── tenants.repository.ts
│   │       │   ├── tvs/
│   │       │   │   ├── tvs.controller.ts
│   │       │   │   ├── tvs.service.ts
│   │       │   │   ├── tvs.routes.ts
│   │       │   │   └── tvs.repository.ts
│   │       │   ├── m3u/
│   │       │   │   ├── m3u.controller.ts       # Endpoints públicos (sem auth)
│   │       │   │   ├── m3u.service.ts          # Geração de playlist M3U
│   │       │   │   ├── m3u.generator.ts         # Builder de M3U (estrutura)
│   │       │   │   └── m3u.routes.ts
│   │       │   ├── media/
│   │       │   │   ├── media.controller.ts
│   │       │   │   ├── media.service.ts
│   │       │   │   ├── media.routes.ts
│   │       │   │   ├── media.repository.ts
│   │       │   │   └── media.processor.ts       # Jobs: transcoding, thumbnails
│   │       │   ├── promotions/
│   │       │   │   ├── promotions.controller.ts
│   │       │   │   ├── promotions.service.ts
│   │       │   │   ├── promotions.routes.ts
│   │       │   │   ├── promotions.repository.ts
│   │       │   │   └── promotions.scheduler.ts  # Agenda/ativa promoções
│   │       │   ├── branding/
│   │       │   │   ├── branding.controller.ts
│   │       │   │   ├── branding.service.ts
│   │       │   │   └── branding.routes.ts
│   │       │   ├── subscriptions/
│   │       │   │   ├── subscriptions.controller.ts
│   │       │   │   ├── subscriptions.service.ts
│   │       │   │   ├── subscriptions.routes.ts
│   │       │   │   └── subscriptions.repository.ts
│   │       │   ├── payments/
│   │       │   │   ├── payments.controller.ts   # + webhook Asaas
│   │       │   │   ├── payments.service.ts
│   │       │   │   ├── payments.routes.ts
│   │       │   │   ├── asaas.service.ts         # Integração com Asaas API
│   │       │   │   └── asaas.webhook.ts         # Handler de webhooks Asaas
│   │       │   ├── campaigns/
│   │       │   │   ├── campaigns.controller.ts  # Admin only
│   │       │   │   ├── campaigns.service.ts
│   │       │   │   ├── campaigns.routes.ts
│   │       │   │   └── campaigns.repository.ts
│   │       │   ├── notifications/
│   │       │   │   ├── notifications.controller.ts
│   │       │   │   ├── notifications.service.ts
│   │       │   │   └── notifications.routes.ts
│   │       │   └── admin/
│   │       │       ├── admin-dashboard.controller.ts
│   │       │       ├── admin-dashboard.service.ts
│   │       │       ├── admin-clients.controller.ts
│   │       │       ├── admin-clients.service.ts
│   │       │       └── admin.routes.ts
│   │       ├── jobs/                # BullMQ job definitions
│   │       │   ├── queues.ts              # Definição das filas
│   │       │   ├── video-transcode.job.ts
│   │       │   ├── youtube-import.job.ts
│   │       │   ├── thumbnail-generate.job.ts
│   │       │   ├── m3u-warm-cache.job.ts
│   │       │   └── notification-dispatch.job.ts
│   │       ├── storage/             # Abstração de armazenamento
│   │       │   ├── storage.provider.ts     # Interface
│   │       │   ├── local-storage.provider.ts
│   │       │   └── s3-storage.provider.ts  # Futuro: S3/MinIO
│   │       ├── utils/
│   │       │   ├── jwt.ts
│   │       │   ├── password.ts
│   │       │   ├── slug.ts
│   │       │   ├── crypto.ts
│   │       │   └── pagination.ts
│   │       └── tests/
│   │           ├── integration/
│   │           └── unit/
│   │
│   ├── frontend/                   # Next.js - Painel do Cliente
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   ├── public/
│   │   │   ├── favicon.ico
│   │   │   └── assets/
│   │   └── src/
│   │       ├── app/                # App Router (Next.js 14+)
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx        # Landing / Login
│   │       │   ├── (auth)/
│   │       │   │   ├── login/page.tsx
│   │       │   │   ├── register/page.tsx
│   │       │   │   └── forgot-password/page.tsx
│   │       │   └── (dashboard)/
│   │       │       ├── layout.tsx             # Sidebar + header
│   │       │       ├── page.tsx               # Dashboard home
│   │       │       ├── tvs/
│   │       │       │   ├── page.tsx           # Lista de TVs
│   │       │       │   └── [id]/
│   │       │       │       └── page.tsx       # Detalhes da TV
│   │       │       ├── promotions/
│   │       │       │   ├── page.tsx           # Lista de promoções
│   │       │       │   ├── new/page.tsx       # Nova promoção
│   │       │       │   └── [id]/
│   │       │       │       ├── page.tsx       # Editar promoção
│   │       │       │       └── edit/page.tsx
│   │       │       ├── media/
│   │       │       │   ├── page.tsx           # Biblioteca de mídia
│   │       │       │   └── upload/page.tsx    # Upload / YouTube import
│   │       │       ├── branding/
│   │       │       │   └── page.tsx           # Logo, marca d'água, cores
│   │       │       ├── plan/
│   │       │       │   └── page.tsx           # Plano atual / upgrade
│   │       │       ├── payments/
│   │       │       │   └── page.tsx           # Histórico de pagamentos
│   │       │       ├── notifications/
│   │       │       │   └── page.tsx           # Central de notificações
│   │       │       └── settings/
│   │       │           └── page.tsx           # Configurações da conta
│   │       ├── components/
│   │       │   ├── ui/              # Componentes base (shadcn/ui)
│   │       │   │   ├── button.tsx
│   │       │   │   ├── input.tsx
│   │       │   │   ├── card.tsx
│   │       │   │   ├── dialog.tsx
│   │       │   │   ├── dropdown.tsx
│   │       │   │   ├── table.tsx
│   │       │   │   ├── tabs.tsx
│   │       │   │   ├── toast.tsx
│   │       │   │   ├── badge.tsx
│   │       │   │   └── skeleton.tsx
│   │       │   ├── layout/
│   │       │   │   ├── sidebar.tsx
│   │       │   │   ├── header.tsx
│   │       │   │   └── dashboard-shell.tsx
│   │       │   ├── tvs/
│   │       │   │   ├── tv-card.tsx
│   │       │   │   ├── tv-status-badge.tsx
│   │       │   │   └── tv-m3u-input.tsx
│   │       │   ├── promotions/
│   │       │   │   ├── promotion-form.tsx
│   │       │   │   ├── promotion-card.tsx
│   │       │   │   ├── schedule-picker.tsx
│   │       │   │   └── media-picker.tsx
│   │       │   ├── media/
│   │       │   │   ├── media-grid.tsx
│   │       │   │   ├── media-card.tsx
│   │       │   │   ├── upload-zone.tsx
│   │       │   │   ├── video-preview.tsx
│   │       │   │   └── youtube-import-dialog.tsx
│   │       │   └── branding/
│   │       │       ├── logo-uploader.tsx
│   │       │       ├── watermark-position-picker.tsx
│   │       │       └── color-picker.tsx
│   │       ├── hooks/
│   │       │   ├── use-auth.ts
│   │       │   ├── use-tvs.ts
│   │       │   ├── use-promotions.ts
│   │       │   ├── use-media.ts
│   │       │   ├── use-upload.ts
│   │       │   └── use-notifications.ts
│   │       ├── lib/
│   │       │   ├── api.ts           # Axios/fetch wrapper com interceptors
│   │       │   ├── auth-context.tsx  # AuthProvider (React Context)
│   │       │   ├── query-client.ts   # TanStack Query config
│   │       │   └── utils.ts
│   │       └── styles/
│   │           └── globals.css
│   │
│   ├── admin/                      # Next.js - Painel Superadmin
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx                    # Login admin
│   │       │   └── (dashboard)/
│   │       │       ├── layout.tsx
│   │       │       ├── page.tsx                # Dashboard (métricas)
│   │       │       ├── clients/
│   │       │       │   ├── page.tsx            # Lista de clientes
│   │       │       │   └── [id]/
│   │       │       │       └── page.tsx        # Detalhes do cliente
│   │       │       ├── plans/
│   │       │       │   ├── page.tsx            # Gerenciar planos
│   │       │       │   └── new/page.tsx        # Novo plano
│   │       │       ├── payments/
│   │       │       │   └── page.tsx            # Visão geral pagamentos
│   │       │       ├── campaigns/
│   │       │       │   ├── page.tsx            # Lista campanhas
│   │       │       │   ├── new/page.tsx        # Nova campanha
│   │       │       │   └── [id]/page.tsx       # Editar campanha
│   │       │       └── notifications/
│   │       │           └── page.tsx            # Enviar broadcast
│   │       ├── components/
│   │       │   ├── dashboard/
│   │       │   │   ├── stats-cards.tsx
│   │       │   │   ├── revenue-chart.tsx
│   │       │   │   ├── active-tvs-chart.tsx
│   │       │   │   └── recent-payments-table.tsx
│   │       │   ├── clients/
│   │       │   │   ├── clients-table.tsx
│   │       │   │   └── client-detail-tabs.tsx
│   │       │   └── campaigns/
│   │       │       ├── campaign-form.tsx
│   │       │       └── target-selector.tsx
│   │       ├── hooks/
│   │       │   ├── use-dashboard.ts
│   │       │   ├── use-clients.ts
│   │       │   └── use-campaigns.ts
│   │       └── lib/
│   │           ├── api.ts
│   │           └── auth-context.tsx
│   │
│   └── worker/                     # Worker de background (BullMQ)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # Entry point
│           ├── config/
│           │   ├── env.ts
│           │   ├── database.ts
│           │   └── redis.ts
│           ├── queues/
│           │   └── index.ts        # Registro de todas as filas/workers
│           ├── processors/
│           │   ├── video-transcode.processor.ts
│           │   ├── youtube-import.processor.ts
│           │   ├── thumbnail.processor.ts
│           │   ├── m3u-cache.processor.ts
│           │   └── notification.processor.ts
│           └── services/
│               ├── ffmpeg.service.ts      # Wrapper FFmpeg (fluent-ffmpeg)
│               ├── youtube-dl.service.ts  # yt-dlp wrapper
│               └── storage.service.ts
│
├── database/
│   ├── migrations/                 # Migrations SQL (node-pg-migrate ou raw)
│   │   ├── 001_initial_schema.sql
│   │   └── ...
│   └── seeds/
│       ├── plans.sql               # Planos iniciais
│       └── admin-user.sql          # Superadmin inicial
│
├── scripts/
│   ├── dev-setup.sh               # Setup ambiente dev
│   ├── migrate.sh                 # Roda migrations
│   └── seed.sh                    # Roda seeds
│
├── infra/
│   ├── nginx/
│   │   └── coolify-routes.conf    # Config extra para Coolify/Traefik
│   └── monitoring/
│       └── healthcheck.sh
│
└── docs/
    ├── ARCHITECTURE.md            # Este arquivo
    ├── API.md                     # Documentação detalhada da API
    └── DEPLOY.md                  # Guia de deploy no Coolify
```

---

## 4. Design da API REST

### 4.1 Convenções

- **Base URL:** `https://api.adega.queroservico.com.br/v1`
- **Autenticação:** `Authorization: Bearer <jwt_token>`
- **Formato:** JSON (request/response)
- **Paginação:** `?page=1&limit=20` → `{ data: [...], meta: { total, page, limit, totalPages } }`

### 4.2 Endpoints

#### 🔐 Auth

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/auth/register` | ❌ | Criar conta (nome, email, senha) |
| `POST` | `/auth/login` | ❌ | Login (email, senha) → JWT + refresh |
| `POST` | `/auth/refresh` | ❌ | Refresh token → novo JWT |
| `POST` | `/auth/logout` | ✅ | Invalida refresh token |
| `POST` | `/auth/forgot-password` | ❌ | Solicita reset de senha |
| `POST` | `/auth/reset-password` | ❌ | Reseta senha com token |
| `GET` | `/auth/me` | ✅ | Dados do usuário logado |

#### 👤 Users (cliente logado)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/users/profile` | ✅ | Perfil completo |
| `PUT` | `/users/profile` | ✅ | Atualizar perfil |
| `PUT` | `/users/password` | ✅ | Alterar senha |
| `DELETE` | `/users/account` | ✅ | Excluir conta |

#### 🏪 Tenants (adegas do usuário)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/tenants` | ✅ | Listar minhas adegas |
| `POST` | `/tenants` | ✅ | Criar nova adega |
| `GET` | `/tenants/:tenantId` | ✅ | Detalhes da adega |
| `PUT` | `/tenants/:tenantId` | ✅ | Atualizar adega |
| `DELETE` | `/tenants/:tenantId` | ✅ | Excluir adega |

> **Contexto:** Após selecionar tenant, todas as rotas abaixo são prefixadas com `/tenants/:tenantId` ou usam header `X-Tenant-Id`.

#### 📺 TVs

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/tenants/:tenantId/tvs` | ✅ | Listar TVs |
| `POST` | `/tenants/:tenantId/tvs` | ✅ | Adicionar TV |
| `GET` | `/tenants/:tenantId/tvs/:tvId` | ✅ | Detalhes da TV |
| `PUT` | `/tenants/:tenantId/tvs/:tvId` | ✅ | Atualizar TV |
| `DELETE` | `/tenants/:tenantId/tvs/:tvId` | ✅ | Remover TV |
| `GET` | `/tenants/:tenantId/tvs/:tvId/m3u` | ✅ | Preview do M3U gerado |
| `GET` | `/tenants/:tenantId/tvs/:tvId/stats` | ✅ | Estatísticas (acessos, online) |

#### 🎬 M3U (público - acessado pelas TVs)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/m3u/:slug` | ❌ | Servir playlist M3U (ex: `/m3u/tv1-nomedaadega.m3u`) |
| `HEAD` | `/m3u/:slug` | ❌ | Headers (ETag, Last-Modified) para cache |

> **Cache:** ETag baseado em content_hash. Responde 304 se não mudou. Cache-Control: max-age=60 (1 minuto).

#### 🎥 Media (upload e biblioteca)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/tenants/:tenantId/media` | ✅ | Listar mídias (filtro por tipo, status) |
| `POST` | `/tenants/:tenantId/media/upload` | ✅ | Upload de arquivo (multipart) |
| `POST` | `/tenants/:tenantId/media/youtube` | ✅ | Importar do YouTube |
| `GET` | `/tenants/:tenantId/media/:mediaId` | ✅ | Detalhes da mídia |
| `PUT` | `/tenants/:tenantId/media/:mediaId` | ✅ | Atualizar metadados |
| `DELETE` | `/tenants/:tenantId/media/:mediaId` | ✅ | Remover mídia |
| `GET` | `/media/:mediaId/stream` | ❌ | Servir arquivo (range requests para vídeo) |
| `GET` | `/media/:mediaId/thumbnail` | ❌ | Servir thumbnail |

#### 📢 Promotions

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/tenants/:tenantId/promotions` | ✅ | Listar promoções |
| `POST` | `/tenants/:tenantId/promotions` | ✅ | Criar promoção |
| `GET` | `/tenants/:tenantId/promotions/:id` | ✅ | Detalhes |
| `PUT` | `/tenants/:tenantId/promotions/:id` | ✅ | Atualizar |
| `DELETE` | `/tenants/:tenantId/promotions/:id` | ✅ | Remover |
| `POST` | `/tenants/:tenantId/promotions/:id/status` | ✅ | Ativar/pausar |
| `POST` | `/tenants/:tenantId/promotions/:id/media` | ✅ | Adicionar mídia à promoção |
| `DELETE` | `/tenants/:tenantId/promotions/:id/media/:mediaId` | ✅ | Remover mídia da promoção |
| `PUT` | `/tenants/:tenantId/promotions/:id/media/reorder` | ✅ | Reordenar mídias |

#### 📺 TV Promotions (associação TV ↔ Promoção)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/tenants/:tenantId/tvs/:tvId/promotions` | ✅ | Promoções da TV |
| `POST` | `/tenants/:tenantId/tvs/:tvId/promotions` | ✅ | Associar promoção |
| `DELETE` | `/tenants/:tenantId/tvs/:tvId/promotions/:promotionId` | ✅ | Desassociar |

#### 🎨 Branding

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/tenants/:tenantId/branding` | ✅ | Config de branding |
| `PUT` | `/tenants/:tenantId/branding` | ✅ | Atualizar branding |
| `POST` | `/tenants/:tenantId/branding/logo` | ✅ | Upload logo |
| `POST` | `/tenants/:tenantId/branding/watermark` | ✅ | Upload marca d'água |

#### 💳 Plans & Subscriptions

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/plans` | ❌ | Listar planos disponíveis (público) |
| `GET` | `/plans/:planId` | ❌ | Detalhes do plano |
| `GET` | `/tenants/:tenantId/subscription` | ✅ | Assinatura atual |
| `POST` | `/tenants/:tenantId/subscription` | ✅ | Criar/alterar assinatura |
| `POST` | `/tenants/:tenantId/subscription/cancel` | ✅ | Cancelar assinatura |
| `POST` | `/tenants/:tenantId/subscription/reactivate` | ✅ | Reativar |

#### 💰 Payments

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/tenants/:tenantId/payments` | ✅ | Histórico de pagamentos |
| `GET` | `/tenants/:tenantId/payments/:paymentId` | ✅ | Detalhes do pagamento |
| `POST` | `/tenants/:tenantId/payments/:paymentId/charge` | ✅ | Gerar cobrança (PIX/boleto) |
| `POST` | `/webhooks/asaas` | ❌ | Webhook Asaas (IP whitelist) |

#### 🔔 Notifications

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/tenants/:tenantId/notifications` | ✅ | Listar notificações |
| `GET` | `/tenants/:tenantId/notifications/unread-count` | ✅ | Contagem de não lidas |
| `PUT` | `/tenants/:tenantId/notifications/:id/read` | ✅ | Marcar como lida |
| `PUT` | `/tenants/:tenantId/notifications/read-all` | ✅ | Marcar todas como lidas |
| `PUT` | `/tenants/:tenantId/notification-settings` | ✅ | Atualizar preferências |

---

#### 🔐 Admin Endpoints

> Prefix: `/admin/v1` — Autenticação separada (admin JWT)

##### Admin Auth

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/admin/auth/login` | ❌ | Login admin |
| `POST` | `/admin/auth/refresh` | ❌ | Refresh token |
| `GET` | `/admin/auth/me` | 🔐 | Dados do admin logado |

##### Admin Dashboard

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/admin/dashboard/summary` | 🔐 | KPIs gerais |
| `GET` | `/admin/dashboard/revenue` | 🔐 | Receita (filtro por período) |
| `GET` | `/admin/dashboard/tvs` | 🔐 | TVs ativas, crescimento |
| `GET` | `/admin/dashboard/subscriptions` | 🔐 | MRR, churn rate |
| `GET` | `/admin/dashboard/activity` | 🔐 | Atividade recente |

##### Admin Clients

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/admin/clients` | 🔐 | Listar clientes |
| `GET` | `/admin/clients/:userId` | 🔐 | Detalhes do cliente |
| `GET` | `/admin/clients/:userId/tenants` | 🔐 | Adegas do cliente |
| `PUT` | `/admin/clients/:tenantId/suspend` | 🔐 | Suspender adega |
| `PUT` | `/admin/clients/:tenantId/activate` | 🔐 | Reativar adega |

##### Admin Plans

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/admin/plans` | 🔐 | Listar planos |
| `POST` | `/admin/plans` | 🔐 | Criar plano |
| `PUT` | `/admin/plans/:planId` | 🔐 | Atualizar plano |
| `DELETE` | `/admin/plans/:planId` | 🔐 | Remover plano |

##### Admin Payments

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/admin/payments` | 🔐 | Todos os pagamentos |
| `GET` | `/admin/payments/pending` | 🔐 | Pendentes |
| `GET` | `/admin/payments/:paymentId` | 🔐 | Detalhes |
| `POST` | `/admin/payments/:paymentId/reconcile` | 🔐 | Conciliar manualmente |

##### Admin Campaigns

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/admin/campaigns` | 🔐 | Listar campanhas |
| `POST` | `/admin/campaigns` | 🔐 | Criar campanha |
| `GET` | `/admin/campaigns/:id` | 🔐 | Detalhes |
| `PUT` | `/admin/campaigns/:id` | 🔐 | Atualizar |
| `DELETE` | `/admin/campaigns/:id` | 🔐 | Remover |
| `POST` | `/admin/campaigns/:id/status` | 🔐 | Ativar/pausar |
| `POST` | `/admin/campaigns/:id/media` | 🔐 | Adicionar mídia |
| `GET` | `/admin/campaigns/:id/targets` | 🔐 | Clientes-alvo |
| `PUT` | `/admin/campaigns/:id/targets` | 🔐 | Atualizar targets |

##### Admin Notifications

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/admin/notifications/broadcast` | 🔐 | Enviar para todos |
| `POST` | `/admin/notifications/tenant/:tenantId` | 🔐 | Enviar para cliente específico |

### 4.3 Exemplos de Request/Response

<details>
<summary><b>POST /auth/register</b></summary>

```json
// Request
{
  "name": "João Silva",
  "email": "joao@adegaboa.com.br",
  "password": "Senha@123",
  "phone": "+5511999999999"
}

// Response 201
{
  "id": "uuid-...",
  "name": "João Silva",
  "email": "joao@adegaboa.com.br",
  "createdAt": "2026-05-23T12:00:00Z"
}
```
</details>

<details>
<summary><b>POST /tenants</b></summary>

```json
// Request
{
  "name": "Adega do Zé",
  "slug": "adegaze"
}

// Response 201
{
  "id": "uuid-...",
  "name": "Adega do Zé",
  "slug": "adegaze",
  "m3uUrl": "https://tv.adega.queroservico.com.br/m3u/tv1-adegaze.m3u",
  "maxTvs": 1,
  "maxStorageMb": 500
}
```
</details>

<details>
<summary><b>POST /tenants/:tenantId/promotions</b></summary>

```json
// Request
{
  "title": "Promoção de Verão - Cervejas 30% OFF",
  "description": "Todas as cervejas artesanais com 30% de desconto",
  "startsAt": "2026-06-01T00:00:00Z",
  "endsAt": "2026-08-31T23:59:59Z",
  "scheduleType": "timerange",
  "scheduleConfig": {
    "days": [1, 2, 3, 4, 5, 6, 7],
    "timeStart": "08:00",
    "timeEnd": "22:00"
  },
  "displayDurationSecs": 15,
  "mediaIds": ["uuid-media-1", "uuid-media-2"]
}

// Response 201
{
  "id": "uuid-...",
  "title": "Promoção de Verão - Cervejas 30% OFF",
  "status": "scheduled",
  "mediaCount": 2,
  "createdAt": "2026-05-23T12:00:00Z"
}
```
</details>

<details>
<summary><b>GET /m3u/tv1-adegaze.m3u</b> (Resposta da TV)</summary>

```m3u
#EXTM3U
#EXTINF:-1 tvg-id="campaign-dev-1" tvg-name="[DEV] Campanha de Verão" tvg-logo="https://..." group-title="Campanhas",[DEV] Campanha de Verão
https://media.adega.queroservico.com.br/campaigns/camp-verao.mp4
#EXTINF:-1 tvg-id="promo-a1b2" tvg-name="Cervejas 30% OFF" tvg-logo="https://..." group-title="Promoções",Cervejas 30% OFF
https://media.adega.queroservico.com.br/media/uuid-a1b2/proc.mp4
#EXTINF:-1 tvg-id="promo-c3d4" tvg-name="Vinhos Importados" tvg-logo="https://..." group-title="Promoções",Vinhos Importados
https://media.adega.queroservico.com.br/media/uuid-c3d4/proc.webm
#EXTINF:-1 tvg-id="branding-intro" tvg-name="Adega do Zé" tvg-logo="https://..." group-title="Branding",Adega do Zé
https://media.adega.queroservico.com.br/branding/uuid-.../intro.mp4
```
</details>

---

## 5. Arquitetura Docker

### 5.1 docker-compose.yml (Desenvolvimento)

```yaml
version: "3.9"

services:
  # ─── PostgreSQL ────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: adega-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: adega
      POSTGRES_USER: adega
      POSTGRES_PASSWORD: ${DB_PASSWORD:-adega_dev}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U adega"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - adega-net

  # ─── Redis ─────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: adega-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - adega-net

  # ─── Backend API ───────────────────────────────────────────
  backend:
    build:
      context: .
      dockerfile: packages/backend/Dockerfile
      target: ${BUILD_TARGET:-development}
    container_name: adega-backend
    restart: unless-stopped
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      PORT: 3001
      DATABASE_URL: postgresql://adega:${DB_PASSWORD:-adega_dev}@postgres:5432/adega
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET:-dev-secret-change-in-prod}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-dev-refresh-secret}
      ASAAS_API_KEY: ${ASAAS_API_KEY:-}
      ASAAS_ENVIRONMENT: ${ASAAS_ENVIRONMENT:-sandbox}
      STORAGE_PATH: /app/storage
      MEDIA_BASE_URL: ${MEDIA_BASE_URL:-http://localhost:3001}
      M3U_BASE_URL: ${M3U_BASE_URL:-http://localhost:3003}
      CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:3000,http://localhost:3002}
    ports:
      - "3001:3001"
    volumes:
      - ./packages/backend/src:/app/packages/backend/src  # Hot reload dev
      - ./packages/shared/src:/app/packages/shared/src
      - media_storage:/app/storage
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - adega-net

  # ─── Frontend Cliente ──────────────────────────────────────
  frontend:
    build:
      context: .
      dockerfile: packages/frontend/Dockerfile
      target: ${BUILD_TARGET:-development}
    container_name: adega-frontend
    restart: unless-stopped
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:3001/v1}
      NEXT_PUBLIC_M3U_BASE_URL: ${NEXT_PUBLIC_M3U_BASE_URL:-http://localhost:3003}
    ports:
      - "3000:3000"
    volumes:
      - ./packages/frontend/src:/app/packages/frontend/src
      - ./packages/shared/src:/app/packages/shared/src
    depends_on:
      - backend
    networks:
      - adega-net

  # ─── Admin Panel ───────────────────────────────────────────
  admin:
    build:
      context: .
      dockerfile: packages/admin/Dockerfile
      target: ${BUILD_TARGET:-development}
    container_name: adega-admin
    restart: unless-stopped
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:3001/v1}
      NEXT_PUBLIC_ADMIN_API_URL: ${NEXT_PUBLIC_ADMIN_API_URL:-http://localhost:3001/admin/v1}
    ports:
      - "3002:3002"
    volumes:
      - ./packages/admin/src:/app/packages/admin/src
      - ./packages/shared/src:/app/packages/shared/src
    depends_on:
      - backend
    networks:
      - adega-net

  # ─── M3U Delivery Service ──────────────────────────────────
  m3u-service:
    build:
      context: .
      dockerfile: packages/backend/Dockerfile   # Reutiliza backend
      target: ${BUILD_TARGET:-development}
    container_name: adega-m3u
    restart: unless-stopped
    command: node dist/m3u-server.js             # Servidor otimizado só para M3U
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      PORT: 3003
      DATABASE_URL: postgresql://adega:${DB_PASSWORD:-adega_dev}@postgres:5432/adega
      REDIS_URL: redis://redis:6379
      STORAGE_PATH: /app/storage
      M3U_CACHE_TTL_SECS: 60
    ports:
      - "3003:3003"
    volumes:
      - media_storage:/app/storage
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - adega-net

  # ─── Background Worker ─────────────────────────────────────
  worker:
    build:
      context: .
      dockerfile: packages/worker/Dockerfile
      target: ${BUILD_TARGET:-development}
    container_name: adega-worker
    restart: unless-stopped
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      DATABASE_URL: postgresql://adega:${DB_PASSWORD:-adega_dev}@postgres:5432/adega
      REDIS_URL: redis://redis:6379
      STORAGE_PATH: /app/storage
      MEDIA_BASE_URL: ${MEDIA_BASE_URL:-http://localhost:3001}
      YT_DLP_PATH: /usr/local/bin/yt-dlp
      FFMPEG_PATH: /usr/local/bin/ffmpeg
      FFPROBE_PATH: /usr/local/bin/ffprobe
    volumes:
      - ./packages/worker/src:/app/packages/worker/src
      - ./packages/shared/src:/app/packages/shared/src
      - media_storage:/app/storage
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - adega-net

networks:
  adega-net:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  media_storage:
```

### 5.2 Dockerfiles

#### packages/backend/Dockerfile

```dockerfile
# ─── Development ─────────────────────────────────────────────
FROM node:22-alpine AS development
RUN apk add --no-cache ffmpeg python3 make g++
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
EXPOSE 3001
CMD ["pnpm", "--filter", "@adega/backend", "dev"]

# ─── Builder ─────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN corepack enable && pnpm install --frozen-lockfile --prod false
COPY . .
RUN pnpm --filter @adega/shared build
RUN pnpm --filter @adega/backend build

# ─── Production ──────────────────────────────────────────────
FROM node:22-alpine AS production
RUN apk add --no-cache ffmpeg curl
WORKDIR /app
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/backend/package.json ./
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3001/health || exit 1
CMD ["node", "dist/index.js"]
```

#### packages/worker/Dockerfile

```dockerfile
# ─── Production Worker ───────────────────────────────────────
FROM node:22-alpine AS production
RUN apk add --no-cache ffmpeg python3 py3-pip curl
RUN pip3 install --break-system-packages yt-dlp
WORKDIR /app
COPY --from=builder /app/packages/worker/dist ./dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/node_modules ./node_modules
HEALTHCHECK --interval=30s --timeout=5s CMD pgrep -f "node dist/index.js" || exit 1
CMD ["node", "dist/index.js"]
```

### 5.3 Coolify Configuration

```
Serviços no Coolify:

1. adega-api        → api.adega.queroservico.com.br       (porta interna 3001)
2. adega-frontend   → adega.queroservico.com.br            (porta interna 3000)
3. adega-admin      → admin.adega.queroservico.com.br      (porta interna 3002)
4. adega-m3u        → tv.adega.queroservico.com.br         (porta interna 3003)
5. adega-worker     → (sem porta pública, processa jobs)
6. adega-postgres   → (rede interna)
7. adega-redis      → (rede interna)
```

---

## 6. Plano de Implementação Faseado

### Fase 1 — Fundação (Semanas 1-3)

**Objetivo:** Infraestrutura base + autenticação + MVP funcional

| # | Tarefa | Prioridade | Estimativa |
|---|--------|-----------|------------|
| 1.1 | Setup monorepo (pnpm workspaces, tsconfig, ESLint) | 🔴 P0 | 2d |
| 1.2 | Docker Compose dev environment | 🔴 P0 | 1d |
| 1.3 | Schema PostgreSQL + migrations | 🔴 P0 | 2d |
| 1.4 | Backend base: Express + middlewares (error, logger, CORS) | 🔴 P0 | 2d |
| 1.5 | Módulo Auth: register, login, JWT, refresh, me | 🔴 P0 | 3d |
| 1.6 | Módulo Tenants: CRUD (slug validation, per-user) | 🔴 P0 | 2d |
| 1.7 | Módulo TVs: CRUD + associação a tenant | 🔴 P0 | 2d |
| 1.8 | Módulo M3U: geração básica de playlist (sem cache) | 🔴 P0 | 2d |
| 1.9 | Frontend base: Next.js + Tailwind + shadcn/ui setup | 🔴 P0 | 1d |
| 1.10 | Frontend Auth: login, register, proteção de rotas | 🔴 P0 | 2d |
| 1.11 | Frontend Dashboard: layout base + lista de TVs + M3U URL | 🔴 P0 | 2d |

**Milestone:** Usuário cria conta, adiciona TV, recebe URL M3U funcional.

---

### Fase 2 — Mídia e Promoções (Semanas 4-7)

**Objetivo:** Upload de mídia, processamento e CRUD de promoções

| # | Tarefa | Prioridade | Estimativa |
|---|--------|-----------|------------|
| 2.1 | Storage provider: local filesystem com abstração | 🔴 P0 | 2d |
| 2.2 | Módulo Media: upload, validação (tipo, tamanho), listagem | 🔴 P0 | 3d |
| 2.3 | Worker: fila de transcoding com FFmpeg (MP4 → H.264/AAC otimizado) | 🔴 P0 | 3d |
| 2.4 | Worker: geração de thumbnails automática | 🟡 P1 | 1d |
| 2.5 | Módulo Promotions: CRUD com scheduling (starts_at, ends_at, timerange, days) | 🔴 P0 | 3d |
| 2.6 | Associação promotion-media (upload + reorder) | 🔴 P0 | 2d |
| 2.7 | Associação TV-promotions (quais promoções em qual TV) | 🔴 P0 | 1d |
| 2.8 | M3U Generator: incluir promoções com dados de media no M3U | 🔴 P0 | 2d |
| 2.9 | Sistema de cache M3U (Redis + ETag/304) | 🟡 P1 | 2d |
| 2.10 | Frontend: upload de mídia com preview + progresso | 🔴 P0 | 3d |
| 2.11 | Frontend: CRUD de promoções com scheduler visual | 🔴 P0 | 3d |
| 2.12 | Frontend: associação TV ↔ promoções (drag & drop simples) | 🔴 P0 | 2d |

**Milestone:** Cliente faz upload de mídia, cria promoções agendadas e as TVs tocam conteúdo dinâmico.

---

### Fase 3 — Branding, YouTube e Refinamentos (Semanas 8-10)

**Objetivo:** Import YouTube, identidade visual e otimizações

| # | Tarefa | Prioridade | Estimativa |
|---|--------|-----------|------------|
| 3.1 | Worker: yt-dlp integration (download melhor qualidade) | 🔴 P0 | 3d |
| 3.2 | API: endpoint YouTube import (submit URL → job) | 🔴 P0 | 1d |
| 3.3 | Frontend: YouTube import dialog (paste URL, preview antes de importar) | 🔴 P0 | 2d |
| 3.4 | Módulo Branding: upload logo/watermark, posicionamento | 🔴 P0 | 2d |
| 3.5 | Frontend: página de branding (logo, marca d'água, cores) | 🔴 P0 | 2d |
| 3.6 | Overlay de marca d'água via FFmpeg (opcional — ou cliente-side no player) | 🟡 P1 | 2d |
| 3.7 | M3U: incluir #EXTINF com tvg-logo para logo do tenant | 🟡 P1 | 1d |
| 3.8 | Otimização M3U service: cache em Redis, compressão gzip | 🟡 P1 | 1d |
| 3.9 | Rate limiting + proteção anti-abuso nos endpoints públicos | 🟡 P1 | 2d |
| 3.10 | Testes de carga no M3U service (simular 100+ TVs) | 🟡 P1 | 1d |

**Milestone:** Sistema completo para o dono da adega: conteúdo, identidade visual e importação de qualquer fonte.

---

### Fase 4 — Admin, Planos e Pagamentos (Semanas 11-14)

**Objetivo:** Painel admin + monetização via Asaas

| # | Tarefa | Prioridade | Estimativa |
|---|--------|-----------|------------|
| 4.1 | Módulo Admin Auth: login separado, roles (admin/superadmin/support) | 🔴 P0 | 2d |
| 4.2 | Módulo Plans: CRUD, features configuráveis | 🔴 P0 | 2d |
| 4.3 | Módulo Subscriptions: criar, status, renovar, cancelar | 🔴 P0 | 3d |
| 4.4 | Integração Asaas: criar cliente, criar cobrança (PIX/boleto/cartão) | 🔴 P0 | 3d |
| 4.5 | Webhook Asaas: handler de pagamento confirmado → ativa assinatura | 🔴 P0 | 2d |
| 4.6 | Limites por plano: max_tvs, max_storage, max_promotions (enforcement) | 🔴 P0 | 2d |
| 4.7 | Módulo Admin Clients: listar, suspender, detalhes | 🔴 P0 | 2d |
| 4.8 | Módulo Admin Dashboard: KPIs (MRR, churn, TVs ativas, receita) | 🔴 P0 | 3d |
| 4.9 | Frontend Admin: login, dashboard, clientes, planos | 🔴 P0 | 4d |
| 4.10 | Frontend Cliente: página de plano, upgrade, histórico de pagamentos | 🔴 P0 | 3d |
| 4.11 | Tela de checkout/planos (pública) | 🟡 P1 | 2d |

**Milestone:** Sistema monetizado. Cliente escolhe plano, paga via Asaas e tem acesso proporcional.

---

### Fase 5 — Campanhas e Notificações (Semanas 15-17)

**Objetivo:** Campanhas do dev + notificações

| # | Tarefa | Prioridade | Estimativa |
|---|--------|-----------|------------|
| 5.1 | Módulo Campaigns: CRUD com agendamento e distribuição | 🔴 P0 | 3d |
| 5.2 | Campaign Targets: seleção de tenants-alvo | 🔴 P0 | 2d |
| 5.3 | Campaign Media: upload de mídias do admin | 🔴 P0 | 1d |
| 5.4 | M3U Generator: intercalar campanhas do dev (baseado em probability_pct) | 🔴 P0 | 2d |
| 5.5 | Módulo Notifications: CRUD, broadcast, por tenant | 🔴 P0 | 2d |
| 5.6 | Notifications automáticas: pagamento confirmado/vencido, boas-vindas | 🟡 P1 | 2d |
| 5.7 | Frontend Admin: CRUD campanhas, target selector, envio broadcast | 🔴 P0 | 3d |
| 5.8 | Frontend Cliente: central de notificações (bell icon + badge) | 🔴 P0 | 2d |
| 5.9 | Email notifications (via worker + SMTP) | 🟡 P2 | 2d |

**Milestone:** Admin consegue criar campanhas que aparecem nas TVs. Clientes recebem notificações.

---

### Fase 6 — Polimento e Produção (Semanas 18-20)

**Objetivo:** Deploy, segurança, monitoramento e extras

| # | Tarefa | Prioridade | Estimativa |
|---|--------|-----------|------------|
| 6.1 | Deploy no Coolify: configurar serviços, domínios, SSL | 🔴 P0 | 2d |
| 6.2 | Healthchecks + logs centralizados (Winston/structured) | 🔴 P0 | 2d |
| 6.3 | Backup automático do PostgreSQL (pg_dump + S3) | 🔴 P0 | 1d |
| 6.4 | Testes E2E: fluxo completo (registro → pagamento → TV toca conteúdo) | 🟡 P1 | 3d |
| 6.5 | Documentação: API docs (OpenAPI/Swagger), guia do usuário | 🟡 P1 | 2d |
| 6.6 | Landing page pública (adega.queroservico.com.br sem auth) | 🟡 P2 | 3d |
| 6.7 | Monitoramento: uptime, erros, alertas (Sentry ou similar) | 🟡 P2 | 2d |
| 6.8 | Página de status pública | 🟢 P3 | 1d |
| 6.9 | CI/CD pipeline (GitHub Actions → build → push → deploy webhook) | 🟡 P1 | 2d |

**Milestone:** Sistema em produção, estável, monitorado e documentado.

---

### Resumo do Cronograma

```
Fase 1 ████████░░░░░░░░░░░░ Semanas 1-3   Fundação
Fase 2 ░░░░░░░░████████░░░░ Semanas 4-7   Mídia & Promoções
Fase 3 ░░░░░░░░░░░░░░████░░ Semanas 8-10  Branding & YouTube
Fase 4 ░░░░░░░░░░░░░░░░░███ Semanas 11-14 Admin & Pagamentos
Fase 5 ░░░░░░░░░░░░░░░░░░░█ Semanas 15-17 Campanhas & Notificações
Fase 6 ░░░░░░░░░░░░░░░░░░░░ Semanas 18-20 Polimento & Deploy
```

**Total estimado:** 20 semanas (5 meses) para 1-2 desenvolvedores.

---

## 7. Decisões de Arquitetura

### 7.1 Por que monorepo?

- **Compartilhamento de tipos:** `@adega/shared` é consumido por backend, frontend, admin e worker
- **Consistência:** mesma versão de TypeScript, ESLint, Prettier em todos os pacotes
- **Refatoração segura:** mudanças no shared propagam para todos os consumidores em tempo de build
- **CI integrado:** um pipeline que testa tudo junto

### 7.2 Por que BullMQ + Redis para jobs?

- **Video transcoding é pesado:** não pode bloquear a API. Precisa de fila assíncrona
- **BullMQ oferece:** retry automático, delayed jobs, prioridades, dashboard de monitoramento
- **Redis já está na stack** para cache M3U, então é reuso da infra
- **Worker separado:** container independente, escala horizontal se necessário

### 7.3 Por que M3U service separado?

- **Alta carga de leitura:** 100 TVs * requisição a cada 60s = 100 req/min. Com cache, quase zero impacto no DB
- **Segurança:** serviço público sem acesso às APIs internas
- **Escala independente:** em picos, replica-se só o M3U service
- **Cache agressivo:** ETag/304, Redis, CDN-friendly (Cache-Control headers)

### 7.4 Estratégia de cache M3U

```
TV solicita /m3u/{slug}
  │
  ├─ ETag match? → 304 Not Modified (economia de banda)
  │
  └─ Sem ETag / modificado:
       │
       ├─ Busca em Redis (key: m3u:{slug})
       │   ├─ HIT  → retorna conteúdo cacheado com ETag (content_hash)
       │   └─ MISS →
       │        ├─ Query DB: tenant, TV, promoções ativas, mídias, campanhas
       │        ├─ Gera playlist M3U
       │        ├─ Armazena em Redis (TTL: 60s) + DB (m3u_playlists)
       │        └─ Retorna com ETag
```

### 7.5 Processamento de vídeo (FFmpeg)

```
Upload MP4 recebido
  → Salvo em storage local (original)
  → Job adicionado à fila "video-transcode"
      → ffprobe: analisa codec, resolução, bitrate
      → Transcoda para H.264/AAC (compatível com TVs/players)
          - Resolução: manter original (até 1080p)
          - Codec: libx264, preset fast, CRF 23
          - Áudio: AAC 128k
          - Container: MP4 (faststart para streaming)
      → Gera thumbnail (frame aos 2 segundos)
  → Atualiza status no DB: processing → ready
```

### 7.6 Importação YouTube (yt-dlp)

```
URL do YouTube recebida
  → Job adicionado à fila "youtube-import"
      → yt-dlp --format "bestvideo[height<=1080]+bestaudio/best[height<=1080]"
      → Download em storage temporário
      → ffprobe para metadados
      → Move para storage definitivo
      → Agenda job de transcoding (mesma pipeline de upload normal)
  → Atualiza status: processing → ready
```

### 7.7 Segurança

| Camada | Medida |
|--------|--------|
| **Transporte** | HTTPS (TLS via Coolify/Traefik) |
| **Autenticação** | JWT (access 15min + refresh 7d rotativo) |
| **Senhas** | bcrypt (cost 12) |
| **API Keys** | Nunca expostas no frontend; backend → Asaas com key em env var |
| **CORS** | Whitelist estrita de origens |
| **Rate Limit** | 100 req/15min por IP; 30 req/min no M3U |
| **Upload** | Validação de tipo (magic bytes), tamanho máximo por plano |
| **Webhook Asaas** | Validação de assinatura + IP whitelist |
| **SQL Injection** | Parameterized queries (pg driver) |
| **XSS** | Next.js escapa por padrão; CSP headers |

### 7.8 Stack tecnológica completa

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| **Backend** | Node.js + Express + TypeScript | Performance, ecossistema, tipagem |
| **Frontend** | Next.js 14 (App Router) + Tailwind + shadcn/ui | SSR opcional, DX excelente, components prontos |
| **Banco** | PostgreSQL 16 | Relacional maduro, JSONB para metadata, constraints |
| **Cache/Fila** | Redis 7 | BullMQ + cache M3U |
| **Jobs** | BullMQ | Robustez, retry, dashboard |
| **Mídia** | FFmpeg + yt-dlp | Padrão da indústria para processamento de vídeo |
| **Armazenamento** | Local filesystem (produção: S3/MinIO) | Simples no início, abstraído para migrar depois |
| **Pagamento** | Asaas API (PIX, boleto, cartão) | Excelente DX, webhooks confiáveis, sandbox bom |
| **Infra** | Docker + Coolify (Traefik) | Infra self-hosted, deploy simplificado |
| **CI/CD** | GitHub Actions | Build + push imagem Docker + webhook Coolify |

---

## Apêndice A: Fluxo de Pagamento (Asaas)

```
1. Cliente escolhe plano → POST /tenants/:id/subscription
2. Backend cria customer no Asaas (se não existir) + subscription
3. Asaas gera cobrança (PIX/boleto/cartão)
4. Cliente paga
5. Asaas envia webhook → POST /webhooks/asaas
6. Backend valida webhook → atualiza payment.status = 'confirmed'
7. Backend ativa subscription → tenant.status = 'active'
8. Backend envia notificação: "Pagamento confirmado! 🎉"
9. Worker agenda próxima cobrança (mensal/anual)
```

## Apêndice B: Geração de Playlist M3U (Algoritmo)

```
function generateM3U(tvId):
  tenant = getTenantByTV(tvId)

  items = []

  // 1. Branding intro (se existir)
  if tenant.branding.introVideo:
    items.push({ type: 'branding', media: introVideo, duration: 5 })

  // 2. Promoções ativas e agendadas da TV
  activePromos = getActivePromotionsForTV(tvId)
    .filter(p => now >= p.startsAt && now <= p.endsAt)
    .filter(p => matchesSchedule(p.scheduleConfig))
    .sort(p.priority DESC)

  for promo in activePromos:
    for media in promo.media (ordered):
      items.push({ type: 'promotion', media, duration: promo.displayDurationSecs })

  // 3. Campanhas do desenvolvedor (targeted ao tenant)
  activeCampaigns = getActiveCampaigns(tenant.id)
    .filter(c => c.distribution == 'random'
      ? Math.random() * 100 < c.probabilityPct
      : c.distribution == 'targeted'
        ? c.targets.includes(tenant.id)
        : true  // sequential
    )

  for campaign in activeCampaigns:
    for media in campaign.media:
      items.push({ type: 'campaign', media, duration: campaign.displayDurationSecs })

  // 4. Monta playlist
  return buildM3UString(items, tenant.branding)
```

---

> **Documento mantido por:** Elí 🤖
> **Última atualização:** 2026-05-23
> **Próxima revisão:** Após implementação da Fase 1
