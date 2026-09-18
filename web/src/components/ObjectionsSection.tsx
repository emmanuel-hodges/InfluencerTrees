// "Objections people raised": the convincer's own notes on pushback and how
// it was handled, kept per idea. Collapsed by default so the home page stays
// short; loaded on mount so the summary can show a count.
import { useEffect, useId, useState, type FormEvent } from 'react';
import { objectionBody, type Objection, type ObjectionBody } from '@inftrees/shared';
import { api, errorMessage } from '../api';
import { describedBy, Field } from './Field';
import { Notice } from './Notice';
import { fieldErrorsFrom, FORM_ERROR, type FieldErrors } from '../lib/validation';

interface Props {
  ideaId: string;
}

export function ObjectionsSection({ ideaId }: Props) {
  const base = `/api/ideas/${encodeURIComponent(ideaId)}/objections`;
  const [objections, setObjections] = useState<Objection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setObjections(null);
    setLoadError(null);
    api
      .get<{ objections: Objection[] }>(base)
      .then((r) => {
        if (!ignore) setObjections(r.objections);
      })
      .catch((e: unknown) => {
        if (!ignore) setLoadError(errorMessage(e));
      });
    return () => {
      ignore = true;
    };
  }, [base]);

  const count = objections ? ` (${objections.length})` : '';

  return (
    <details className="card details">
      <summary className="details__summary">Objections people raised{count}</summary>
      <div className="details__body stack">
        {loadError ? <Notice kind="error">{loadError}</Notice> : null}
        {objections === null && !loadError ? <p className="muted">Loading…</p> : null}
        {objections && objections.length === 0 ? (
          <p className="muted">
            None recorded yet. When someone pushes back on the idea, note what they said and how you handled it, so the
            next conversation goes better.
          </p>
        ) : null}
        {objections && objections.length > 0 ? (
          <ul className="objection-list">
            {objections.map((o) => (
              <ObjectionItem
                key={o.objectionId}
                objection={o}
                base={base}
                onSaved={(next) => setObjections((prev) => (prev ?? []).map((x) => (x.objectionId === next.objectionId ? next : x)))}
                onDeleted={(id) => setObjections((prev) => (prev ?? []).filter((x) => x.objectionId !== id))}
              />
            ))}
          </ul>
        ) : null}
        <ObjectionForm
          heading="Add an objection"
          submitLabel="Add"
          onSubmit={async (body) => {
            const created = await api.post<Objection>(base, body);
            setObjections((prev) => [...(prev ?? []), created]);
          }}
        />
      </div>
    </details>
  );
}

interface ItemProps {
  objection: Objection;
  base: string;
  onSaved: (next: Objection) => void;
  onDeleted: (objectionId: string) => void;
}

function ObjectionItem({ objection, base, onSaved, onDeleted }: ItemProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const url = `${base}/${encodeURIComponent(objection.objectionId)}`;

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.del<{ ok: true }>(url);
      onDeleted(objection.objectionId);
    } catch (e) {
      setDeleteError(errorMessage(e));
      setDeleting(false);
    }
  }

  if (mode === 'edit') {
    return (
      <li className="objection">
        <ObjectionForm
          heading="Edit objection"
          submitLabel="Save"
          initial={objection}
          onCancel={() => setMode('view')}
          onSubmit={async (body) => {
            const saved = await api.put<Objection>(url, body);
            onSaved(saved);
            setMode('view');
          }}
        />
      </li>
    );
  }

  return (
    <li className="objection">
      <p className="objection__text">{objection.text}</p>
      {objection.handledNote ? (
        <p className="objection__note">
          <span className="objection__note-label">How I handled it: </span>
          {objection.handledNote}
        </p>
      ) : null}
      {mode === 'confirm-delete' ? (
        <div className="btn-row">
          <span className="muted">Delete this objection?</span>
          <button type="button" className="btn btn--danger btn--small" onClick={remove} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button type="button" className="btn btn--small" onClick={() => setMode('view')} disabled={deleting}>
            Keep
          </button>
        </div>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn--small" onClick={() => setMode('edit')}>
            Edit
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setMode('confirm-delete')}>
            Delete
          </button>
        </div>
      )}
      {deleteError ? (
        <p className="error" role="alert">
          {deleteError}
        </p>
      ) : null}
    </li>
  );
}

interface FormProps {
  heading: string;
  submitLabel: string;
  initial?: Objection;
  onSubmit: (body: ObjectionBody) => Promise<void>;
  onCancel?: () => void;
}

function ObjectionForm({ heading, submitLabel, initial, onSubmit, onCancel }: FormProps) {
  const id = useId();
  const textId = `${id}-text`;
  const noteId = `${id}-note`;
  const [text, setText] = useState(initial?.text ?? '');
  const [note, setNote] = useState(initial?.handledNote ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = objectionBody.safeParse({ text, handledNote: note.trim() === '' ? null : note });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
      if (!initial) {
        setText('');
        setNote('');
      }
    } catch (err) {
      setErrors({ [FORM_ERROR]: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="objection-form stack" onSubmit={handleSubmit} aria-labelledby={`${id}-heading`}>
      <h4 id={`${id}-heading`} className="objection-form__heading">
        {heading}
      </h4>
      <Field id={textId} label="What they said" error={errors.text}>
        <textarea
          id={textId}
          className="input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          aria-describedby={describedBy(textId, { error: errors.text })}
          disabled={submitting}
        />
      </Field>
      <Field id={noteId} label="How I handled it (optional)" error={errors.handledNote}>
        <textarea
          id={noteId}
          className="input"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={4000}
          aria-describedby={describedBy(noteId, { error: errors.handledNote })}
          disabled={submitting}
        />
      </Field>
      {errors[FORM_ERROR] ? (
        <p className="error" role="alert">
          {errors[FORM_ERROR]}
        </p>
      ) : null}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary btn--small" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn--small" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
