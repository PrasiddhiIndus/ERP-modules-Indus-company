import React, { useRef, useState } from 'react';
import { Upload, Eye, Download, RefreshCw, X, FileText } from 'lucide-react';
import { presignFleetR2Get, downloadFleetR2File, fileLabelFromR2Key, FLEET_ATTACHMENT_ACCEPT } from '../../lib/fleetR2';

/**
 * Multi-file picker + list of saved R2 keys + pending File objects (upload on save).
 */
export default function FleetAttachmentUploader({
  savedKeys = [],
  onRemoveSavedKey,
  onReplaceSavedKey,
  pendingFiles = [],
  onPendingAdd,
  onRemovePending,
  multiple = true,
  maxTotal = 10,
  disabled = false,
  label = 'Attachments',
  helperText = 'PDF, JPG, JPEG, PNG, DOC, DOCX (max 25 MB each). Files are stored in Cloudflare R2.',
}) {
  const inputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const [replaceKey, setReplaceKey] = useState(null);
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

  const handleReplacePick = (e) => {
    const file = e.target.files?.[0];
    if (file && replaceKey && onReplaceSavedKey) {
      onReplaceSavedKey(replaceKey, file);
    }
    setReplaceKey(null);
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

  const downloadSavedKey = async (key) => {
    try {
      await downloadFleetR2File(key);
    } catch (err) {
      alert(err?.message || 'Could not download file.');
    }
  };

  const startReplace = (key) => {
    setReplaceKey(key);
    replaceInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <p className="text-xs text-gray-500">{helperText}</p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={FLEET_ATTACHMENT_ACCEPT}
          className="hidden"
          disabled={disabled || total >= maxTotal}
          onChange={handlePick}
        />
        {onReplaceSavedKey && (
          <input
            ref={replaceInputRef}
            type="file"
            accept={FLEET_ATTACHMENT_ACCEPT}
            className="hidden"
            disabled={disabled}
            onChange={handleReplacePick}
          />
        )}
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
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadSavedKey(key)}
                  className="rounded p-1 text-blue-600 hover:bg-blue-50"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                {onReplaceSavedKey && (
                  <button
                    type="button"
                    onClick={() => startReplace(key)}
                    className="rounded p-1 text-amber-600 hover:bg-amber-50"
                    title="Replace"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
                {onRemoveSavedKey && (
                  <button
                    type="button"
                    onClick={() => onRemoveSavedKey(key)}
                    className="rounded p-1 text-red-600 hover:bg-red-50"
                    title="Delete"
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
