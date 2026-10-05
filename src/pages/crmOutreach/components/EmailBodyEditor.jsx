import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Code2, Columns2, Eye, LayoutTemplate, Monitor, Smartphone } from 'lucide-react';
import { EMAIL_HTML_STARTER, looksLikeHtmlEmail } from '../../../../shared/emailHtml.mjs';
import EmailPreviewFrame from './EmailPreviewFrame';
import MergeTokenChips from './MergeTokenChips';

const MODES = [
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'split', label: 'Split', icon: Columns2 },
  { id: 'preview', label: 'Preview', icon: Eye },
];

function Segmented({ options, value, onChange, label }) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5" role="group" aria-label={label}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            title={opt.title || opt.label}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-semibold transition-colors ${
              active ? 'bg-accent text-white' : 'text-ink-secondary hover:bg-slate-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {opt.label ? <span className="hidden sm:inline">{opt.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Email body editor with live HTML/CSS preview.
 * `renderPreview(body)` fills merge tokens with sample data for the preview only — the saved value is untouched.
 */
export default function EmailBodyEditor({ value, onChange, tokens, renderPreview, heightClass = 'h-[420px]' }) {
  const [mode, setMode] = useState('split');
  const [device, setDevice] = useState('desktop');
  const textareaRef = useRef(null);

  const isHtml = looksLikeHtmlEmail(value);
  const lineCount = useMemo(() => String(value || '').split('\n').length, [value]);
  const previewBody = renderPreview ? renderPreview(value) : value;

  const replaceSelection = useCallback(
    (insert) => {
      const el = textareaRef.current;
      const text = String(value || '');
      const start = el?.selectionStart ?? text.length;
      const end = el?.selectionEnd ?? text.length;
      onChange(text.slice(0, start) + insert + text.slice(end));
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        el.setSelectionRange(start + insert.length, start + insert.length);
      });
    },
    [value, onChange]
  );

  const insertToken = useCallback(
    (token) => {
      if (mode === 'preview') setMode('split');
      replaceSelection(token);
    },
    [mode, replaceSelection]
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      replaceSelection('  ');
    }
  };

  const insertStarter = () => {
    if (String(value || '').trim() && !window.confirm('Replace the current body with the HTML email layout?')) return;
    onChange(EMAIL_HTML_STARTER);
    if (mode === 'preview') setMode('split');
  };

  const showCode = mode !== 'preview';
  const showPreview = mode !== 'code';

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <Segmented options={MODES} value={mode} onChange={setMode} label="Editor view" />
          <span
            className={`erp-badge border text-[10px] ${
              isHtml ? 'bg-info-soft text-info border-info-border' : 'bg-gray-100 text-gray-700 border-gray-200'
            }`}
            title={isHtml ? 'Sent as HTML email' : 'Sent as plain text (line breaks kept)'}
          >
            {isHtml ? 'HTML' : 'Plain text'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={insertStarter}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-ink-secondary hover:bg-slate-50"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            HTML layout
          </button>
          {showPreview ? (
            <Segmented
              options={[
                { id: 'desktop', label: '', title: 'Desktop width', icon: Monitor },
                { id: 'mobile', label: '', title: 'Mobile width (375px)', icon: Smartphone },
              ]}
              value={device}
              onChange={setDevice}
              label="Preview width"
            />
          ) : null}
        </div>
      </div>

      <div
        className={`grid ${
          mode === 'split' ? 'grid-rows-2 lg:grid-rows-1 lg:grid-cols-2' : 'grid-rows-1 grid-cols-1'
        } ${heightClass}`}
      >
        {showCode ? (
          <div className={`flex flex-col min-h-0 ${mode === 'split' ? 'border-b lg:border-b-0 lg:border-r border-slate-200' : ''}`}>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              wrap="off"
              placeholder={'Write plain text, or HTML with inline CSS, e.g.\n<p style="color:#b91c1c">Hello {{first_name}}</p>'}
              className="flex-1 min-h-0 w-full resize-none bg-[#0f172a] text-slate-100 caret-white font-mono text-[12px] leading-5 p-3 focus:outline-none placeholder:text-slate-500"
              aria-label="Email body code"
            />
            <div className="flex items-center justify-between px-3 py-1 text-[10px] text-slate-400 bg-[#0b1220] font-mono">
              <span>{lineCount} line{lineCount !== 1 ? 's' : ''}</span>
              <span>Tab inserts spaces</span>
            </div>
          </div>
        ) : null}
        {showPreview ? (
          <div className="min-h-0">
            <EmailPreviewFrame body={previewBody} device={device} />
          </div>
        ) : null}
      </div>

      {tokens?.length ? (
        <div className="px-2.5 pb-2.5 border-t border-slate-200 bg-white">
          <MergeTokenChips tokens={tokens} onInsert={insertToken} />
        </div>
      ) : null}
    </div>
  );
}
