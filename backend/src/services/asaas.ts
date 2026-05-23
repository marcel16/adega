import axios, { AxiosInstance } from 'axios';

// ── Types ──
export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  mobilePhone?: string;
  cpfCnpj: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
  additionalEmails?: string;
  municipalInscription?: string;
  stateInscription?: string;
  observations?: string;
  groupName?: string;
  company?: string;
}

export interface CreateCustomerInput {
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
  mobilePhone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
}

export interface AsaasPayment {
  id: string;
  customer: string;
  value: number;
  netValue: number;
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
  status: string;
  dueDate: string;
  paymentDate?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodeUrl?: string;
  pixCopiaECola?: string;
  invoiceNumber?: string;
  description?: string;
  externalReference?: string;
  canBePaidAfterDueDate?: boolean;
  originalDueDate?: string;
  installment?: string;
  discount?: { value: number; dueDateLimitDays: number };
  fine?: { value: number };
  interest?: { value: number };
  postalService?: boolean;
  creditCard?: AsaasCreditCard;
}

export interface CreatePaymentInput {
  customer: string;
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
  installmentCount?: number;
  installmentValue?: number;
  discount?: { value: number; dueDateLimitDays: number };
  fine?: { value: number };
  interest?: { value: number };
  postalService?: boolean;
  creditCard?: AsaasCreditCard;
  creditCardHolderInfo?: AsaasCreditCardHolderInfo;
}

export interface AsaasWebhook {
  id: string;
  url: string;
  email: string;
  enabled: boolean;
  interrupted: boolean;
  apiVersion: number;
  authToken?: string;
}

export interface AsaasCreditCard {
  creditCardNumber: string;
  creditCardHolderName: string;
  creditCardExpiryMonth: string;
  creditCardExpiryYear: string;
  creditCardCcv: string;
}

export interface AsaasCreditCardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
  mobilePhone?: string;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  nextDueDate: string;
  cycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
  description?: string;
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
  status: string;
  externalReference?: string;
  maxPayments?: number;
  endDate?: string;
}

export interface CreateSubscriptionInput {
  customer: string;
  billingType: CreatePaymentInput['billingType'];
  value: number;
  nextDueDate: string;
  cycle: AsaasSubscription['cycle'];
  description?: string;
  externalReference?: string;
  maxPayments?: number;
  endDate?: string;
  creditCard?: AsaasCreditCard;
  creditCardHolderInfo?: AsaasCreditCardHolderInfo;
}

// ── Asaas API client ──
class AsaasService {
  private api: AxiosInstance;
  private baseUrl: string;
  private accessToken: string;

  constructor() {
    const env = process.env.ASAAS_ENV || 'sandbox';
    this.accessToken = process.env.ASAAS_API_KEY || '';
    this.baseUrl = env === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3';

    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'access_token': this.accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error.response?.status;
        const data = error.response?.data;

        if (status === 401) {
          console.error('[Asaas] Authentication failed - check API key');
        } else if (status === 429) {
          console.warn('[Asaas] Rate limited, retrying...');
        }

        const message = data?.errors?.[0]?.description || error.message;
        console.error(`[Asaas] API error (${status}):`, message);

        return Promise.reject(new Error(message));
      },
    );
  }

  // ── Customers ──

  async createCustomer(input: CreateCustomerInput): Promise<AsaasCustomer> {
    console.log(`[Asaas] Creating customer: ${input.name} (${input.email})`);
    const { data } = await this.api.post<AsaasCustomer>('/customers', input);
    console.log(`[Asaas] Customer created: ${data.id}`);
    return data;
  }

  async getCustomer(id: string): Promise<AsaasCustomer> {
    const { data } = await this.api.get<AsaasCustomer>(`/customers/${id}`);
    return data;
  }

  async getCustomerByEmail(email: string): Promise<AsaasCustomer | null> {
    try {
      const { data } = await this.api.get<{ data: AsaasCustomer[] }>('/customers', {
        params: { email },
      });
      return data.data?.[0] || null;
    } catch {
      return null;
    }
  }

  async updateCustomer(id: string, input: Partial<CreateCustomerInput>): Promise<AsaasCustomer> {
    const { data } = await this.api.put<AsaasCustomer>(`/customers/${id}`, input);
    return data;
  }

  async deleteCustomer(id: string): Promise<void> {
    await this.api.delete(`/customers/${id}`);
  }

  async listCustomers(params?: {
    name?: string;
    email?: string;
    cpfCnpj?: string;
    offset?: number;
    limit?: number;
  }): Promise<{ data: AsaasCustomer[]; totalCount: number }> {
    const { data } = await this.api.get('/customers', { params });
    return data;
  }

  // ── Payments ──

  async createPayment(input: CreatePaymentInput): Promise<AsaasPayment> {
    console.log(`[Asaas] Creating payment: ${input.value} ${input.billingType} for ${input.customer}`);
    const { data } = await this.api.post<AsaasPayment>('/payments', input);
    console.log(`[Asaas] Payment created: ${data.id}, status: ${data.status}`);
    return data;
  }

  async getPayment(id: string): Promise<AsaasPayment> {
    const { data } = await this.api.get<AsaasPayment>(`/payments/${id}`);
    return data;
  }

  async getPaymentByExternalRef(externalReference: string): Promise<AsaasPayment | null> {
    try {
      const { data } = await this.api.get<{ data: AsaasPayment[] }>('/payments', {
        params: { externalReference },
      });
      return data.data?.[0] || null;
    } catch {
      return null;
    }
  }

  async listPayments(params?: {
    customer?: string;
    status?: string;
    billingType?: string;
    dueDate?: string;
    dueDateGe?: string;
    dueDateLe?: string;
    offset?: number;
    limit?: number;
  }): Promise<{ data: AsaasPayment[]; totalCount: number }> {
    const { data } = await this.api.get('/payments', { params });
    return data;
  }

  async deletePayment(id: string): Promise<void> {
    await this.api.delete(`/payments/${id}`);
  }

  async refundPayment(id: string, value?: number): Promise<AsaasPayment> {
    const body = value !== undefined ? { value } : {};
    const { data } = await this.api.post<AsaasPayment>(`/payments/${id}/refund`, body);
    return data;
  }

  async getPixQrCode(id: string): Promise<{ encodedImage: string; payload: string; expirationDate: string }> {
    const { data } = await this.api.get(`/payments/${id}/pixQrCode`);
    return data;
  }

  // ── Subscriptions ──

  async createSubscription(input: CreateSubscriptionInput): Promise<AsaasSubscription> {
    console.log(`[Asaas] Creating subscription: ${input.value}/mo for ${input.customer}`);
    const { data } = await this.api.post<AsaasSubscription>('/subscriptions', input);
    console.log(`[Asaas] Subscription created: ${data.id}`);
    return data;
  }

  async getSubscription(id: string): Promise<AsaasSubscription> {
    const { data } = await this.api.get<AsaasSubscription>(`/subscriptions/${id}`);
    return data;
  }

  async listSubscriptions(params?: {
    customer?: string;
    status?: string;
    offset?: number;
    limit?: number;
  }): Promise<{ data: AsaasSubscription[]; totalCount: number }> {
    const { data } = await this.api.get('/subscriptions', { params });
    return data;
  }

  async cancelSubscription(id: string): Promise<AsaasSubscription> {
    const { data } = await this.api.delete<AsaasSubscription>(`/subscriptions/${id}`);
    console.log(`[Asaas] Subscription cancelled: ${id}`);
    return data;
  }

  // ── Webhooks ──

  async createWebhook(url: string, email: string, enabled = true): Promise<AsaasWebhook> {
    const { data } = await this.api.post<AsaasWebhook>('/webhooks', { url, email, enabled });
    console.log(`[Asaas] Webhook created: ${data.id} -> ${url}`);
    return data;
  }

  async getWebhooks(): Promise<AsaasWebhook[]> {
    const { data } = await this.api.get<{ data: AsaasWebhook[] }>('/webhooks');
    return data.data;
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.api.delete(`/webhooks/${id}`);
  }

  // ── Notifications ──

  async getNotifications(params?: {
    customer?: string;
    event?: string;
    offset?: number;
    limit?: number;
  }): Promise<{ data: any[]; totalCount: number }> {
    const { data } = await this.api.get('/notifications', { params });
    return data;
  }
}

// ── Singleton instance ──
let instance: AsaasService | null = null;

export function getAsaasService(): AsaasService {
  if (!instance) {
    instance = new AsaasService();
  }
  return instance;
}

export { AsaasService };
export default AsaasService;
