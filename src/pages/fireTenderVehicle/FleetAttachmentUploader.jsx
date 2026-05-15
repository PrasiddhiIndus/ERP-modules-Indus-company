import React, { useRef } from 'react';
import { Upload, Eye, X, FileText } from 'lucide-react';
import { presignFleetR2Get, fileLabelFromR2Key } from '../../lib/fleetR2';

/**
 * Multi-file picker + list of saved R2 keys + pending File objects (upload on save).
 */
export default function FleetAttachmentUploader({
  savedKeys = [],
  onRemoveSavedKey,
  pendingFiles = [],
  onPendingAdd,
  onRemovePending,
  multiple = true,
  maxTotal = 10,
  disabled = false,
  helperText = 'PDF, images, Word, Excel (max 25 MB each). Files are stored in Cloudflare R2.',
}) {
  const inputRef = useRef(null);
  const total = savedKeys.length + pendingFiles.length;

  const handlePick = (e) => {
    const list = e.target.files;
    if (!list?.length) return;
    const next = multiple ? Array.from(list) : [list[0]];
    const room = maxTotal - total;
    if (room <= 0) return;
    onPendingAdd(next.slice(0, room));
    e.target.value = '';
  };

  const openSavedKey = async (key) => {
    try {
      const url = await presignFleetR2Get(key);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert(err?.message || 'Could not open file.');
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Attachments (Cloudflare R2)</label>
      <p className="text-xs text-gray-500">{helperText}</p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.doc,.docx,application/pdf,image/*"
          className="hidden"
          disabled={disabled || total >= maxTotal}
          onChange={handlePick}
        />
        <button
          type="button"
          disabled={disabled || total >= maxTotal}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {multiple ? 'Add files' : 'Choose file'}
        </button>
        <span className="text-xs text-gray-500">
          {total} / {maxTotal} file{maxTotal === 1 ? '' : 's'}
        </span>
      </div>

      {savedKeys.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-gray-50">
          {savedKeys.map((key) => (
            <li key={key} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 truncate text-gray-800">
                <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="truncate" title={key}>
                  {fileLabelFromR2Key(key)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => openSavedKey(key)}
                  className="rounded p-1 text-blue-600 hover:bg-blue-50"
                  title="Open"
                >
                  <Eye className="h-4 w-4" />
                </button>
                {onRemoveSavedKey && (
                  <button
                    type="button"
                    onClick={() => onRemoveSavedKey(key)}
                    className="rounded p-1 text-red-600 hover:bg-red-50"
                    title="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pendingFiles.length > 0 && (
        <ul className="divide-y divide-amber-100 rounded-lg border border-amber-200 bg-amber-50">
          {pendingFiles.map((file, idx) => (
            <li key={`${file.name}-${file.size}-${idx}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="truncate text-amber-900" title={file.name}>
                {file.name} <span className="text-amber-700">(not saved yet)</span>
              </span>
              <button
                type="button"
                onClick={() => onRemovePending(idx)}
                className="shrink-0 rounded p-1 text-red-600 hover:bg-red-50"
                title="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
