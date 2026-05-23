import { useState, useRef, DragEvent } from 'react';
import { Upload, X, FileText, Image, Film, Music } from 'lucide-react';

interface FileUploadProps {
  accept?: string;
  maxSizeMB?: number;
  multiple?: boolean;
  value?: File | File[] | null;
  onChange: (files: File | File[] | null) => void;
  preview?: boolean;
  label?: string;
  error?: string;
  className?: string;
  currentUrl?: string;
}

export default function FileUpload({
  accept = '*',
  maxSizeMB = 100,
  multiple = false,
  value,
  onChange,
  preview = true,
  label = 'Arraste arquivos ou clique para selecionar',
  error,
  className = '',
  currentUrl,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOut = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length) {
      processFiles(files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFiles(e.target.files);
    }
  };

  const processFiles = (files: FileList) => {
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSizeMB * 1024 * 1024) {
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    if (multiple) {
      const existing = Array.isArray(value) ? value : [];
      onChange([...existing, ...validFiles]);
    } else {
      onChange(validFiles[0]);
    }
  };

  const removeFile = (index?: number) => {
    if (multiple && Array.isArray(value)) {
      const updated = value.filter((_, i) => i !== index);
      onChange(updated.length > 0 ? updated : null);
    } else {
      onChange(null);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const files = value ? (Array.isArray(value) ? value : [value]) : [];

  const getFileTypeIcon = (file: File) => {
    if (file.type.startsWith('video/')) return <Film size={20} className="text-purple-400" />;
    if (file.type.startsWith('audio/')) return <Music size={20} className="text-green-400" />;
    if (file.type.startsWith('image/')) return <Image size={20} className="text-blue-400" />;
    return <FileText size={20} className="text-gray-400" />;
  };

  const getFilePreview = (file: File) => {
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      return URL.createObjectURL(file);
    }
    return null;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={className}>
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
          isDragging
            ? 'border-amber-400 bg-amber-400/10'
            : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
        } ${error ? 'border-red-500' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
        />
        <Upload size={32} className="mx-auto text-gray-500 mb-3" />
        <p className="text-sm text-gray-400">{label}</p>
        <p className="text-xs text-gray-600 mt-1">
          {accept !== '*' ? `Formatos: ${accept}` : 'Todos os formatos'} · Máx {maxSizeMB}MB
        </p>
      </div>

      {/* Error */}
      {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}

      {/* Preview / File List */}
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {currentUrl && !Array.isArray(value) && (
            <div className="relative group">
              {currentUrl.match(/\.(mp4|webm|mov)$/i) ? (
                <video src={currentUrl} className="w-full h-32 object-cover rounded-lg" controls />
              ) : (
                <img src={currentUrl} alt="Preview" className="w-full h-32 object-cover rounded-lg" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center">
                <span className="text-xs text-white">Substituir arquivo</span>
              </div>
            </div>
          )}
          {files.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-gray-800 rounded-lg p-3 border border-gray-700"
            >
              {preview && getFilePreview(file) && (
                <div className="relative flex-shrink-0">
                  {file.type.startsWith('image/') ? (
                    <img
                      src={getFilePreview(file)!}
                      alt={file.name}
                      className="h-12 w-12 object-cover rounded"
                    />
                  ) : (
                    <video src={getFilePreview(file)!} className="h-12 w-12 object-cover rounded" />
                  )}
                </div>
              )}
              {(!preview || !getFilePreview(file)) && (
                <div className="flex-shrink-0">{getFileTypeIcon(file)}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
                className="text-gray-500 hover:text-red-400 p-1"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
