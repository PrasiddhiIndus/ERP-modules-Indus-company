/** Question builder for survey templates (stored in survey_templates.questions jsonb). */
import React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { TinyInput, TinySelect, SecondaryButton } from "../../../components/erpUi";
import {
  RATING_MAX,
  RATING_MIN,
  SURVEY_QUESTION_TYPES,
  isChoiceQuestion,
  newQuestionId,
} from "../../../../shared/surveyModel.mjs";

export function blankQuestion(type = "rating") {
  return {
    id: newQuestionId(),
    type,
    label: "",
    required: true,
    options: isChoiceQuestion(type) ? ["", ""] : undefined,
  };
}

function QuestionCard({ question, index, total, error, onChange, onMove, onRemove }) {
  const set = (patch) => onChange({ ...question, ...patch });
  const choice = isChoiceQuestion(question.type);
  const options = question.options || [];

  const changeType = (type) => {
    if (isChoiceQuestion(type)) set({ type, options: options.length ? options : ["", ""] });
    else set({ type, options: undefined });
  };

  return (
    <div className={`rounded-card border ${error ? "border-critical-border" : "border-border"} bg-surface p-3 space-y-2.5`}>
      <div className="flex flex-wrap items-start gap-2">
        <span className="mt-2 w-6 shrink-0 text-[11px] font-semibold text-ink-muted">Q{index + 1}</span>
        <TinyInput
          type="text"
          value={question.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Question text"
          className="min-w-[240px] flex-1"
          aria-label={`Question ${index + 1} text`}
        />
        <TinySelect value={question.type} onChange={(e) => changeType(e.target.value)} aria-label="Question type">
          {SURVEY_QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </TinySelect>
        <label className="flex h-9 items-center gap-1.5 text-[11px] text-ink-secondary">
          <input type="checkbox" checked={question.required} onChange={(e) => set({ required: e.target.checked })} />
          Required
        </label>
        <div className="flex h-9 items-center gap-1">
          <button
            type="button"
            className="p-1 text-ink-muted hover:text-ink disabled:opacity-30"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="p-1 text-ink-muted hover:text-ink disabled:opacity-30"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="p-1 text-critical hover:opacity-80" onClick={onRemove} aria-label="Remove question">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {choice ? (
        <div className="ml-8 space-y-1.5">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-ink-muted text-xs">{question.type === "single_choice" ? "○" : "☐"}</span>
              <TinyInput
                type="text"
                value={opt}
                onChange={(e) => set({ options: options.map((o, j) => (j === i ? e.target.value : o)) })}
                placeholder={`Option ${i + 1}`}
                className="w-72"
                aria-label={`Option ${i + 1}`}
              />
              <button
                type="button"
                className="text-ink-muted hover:text-critical disabled:opacity-30"
                onClick={() => set({ options: options.filter((_, j) => j !== i) })}
                disabled={options.length <= 2}
                aria-label="Remove option"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-[11px] font-medium text-accent hover:underline"
            onClick={() => set({ options: [...options, ""] })}
          >
            + Add option
          </button>
        </div>
      ) : (
        <p className="ml-8 text-[11px] text-ink-muted">
          {question.type === "rating"
            ? `Employee picks ${RATING_MIN}–${RATING_MAX}.`
            : question.type === "long_text"
              ? "Multi-line answer."
              : "One-line answer."}
        </p>
      )}
      {error ? <p className="ml-8 text-[10px] text-critical">{error}</p> : null}
    </div>
  );
}

export default function SurveyQuestionBuilder({ questions, onChange, errors = {} }) {
  const update = (i, q) => onChange(questions.map((row, j) => (j === i ? q : row)));
  const move = (i, delta) => {
    const next = [...questions];
    const [row] = next.splice(i, 1);
    next.splice(i + delta, 0, row);
    onChange(next);
  };

  return (
    <div className="space-y-2.5">
      {questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          question={q}
          index={i}
          total={questions.length}
          error={errors[`question_${i}`]}
          onChange={(next) => update(i, next)}
          onMove={(delta) => move(i, delta)}
          onRemove={() => onChange(questions.filter((_, j) => j !== i))}
        />
      ))}
      {errors.questions ? <p className="text-[11px] text-critical">{errors.questions}</p> : null}
      <div className="flex flex-wrap gap-2">
        {SURVEY_QUESTION_TYPES.map((t) => (
          <SecondaryButton key={t.value} onClick={() => onChange([...questions, blankQuestion(t.value)])}>
            <Plus className="w-3.5 h-3.5" /> {t.label}
          </SecondaryButton>
        ))}
      </div>
    </div>
  );
}
