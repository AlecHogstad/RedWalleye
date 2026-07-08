import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ConfirmOptions = {
  title: string;
  message?: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type PromptOptions = {
  title: string;
  message?: string;
  detail?: string;
  inputPlaceholder?: string;
  /** When set, confirm stays disabled until the input matches (trimmed, case-insensitive). */
  match?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type DialogState =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void };

type DialogContextValue = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setDialog({ kind: "confirm", opts, resolve });
      }),
    [],
  );

  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setDialog({ kind: "prompt", opts, resolve });
      }),
    [],
  );

  const close = () => setDialog(null);

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {dialog && (
        <DialogShell
          dialog={dialog}
          onClose={close}
        />
      )}
    </DialogContext.Provider>
  );
}

export function useConfirm(): DialogContextValue["confirm"] {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}

export function usePrompt(): DialogContextValue["prompt"] {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("usePrompt must be used within ConfirmProvider");
  return ctx.prompt;
}

function DialogShell({
  dialog,
  onClose,
}: {
  dialog: DialogState;
  onClose: () => void;
}) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState("");

  const finishConfirm = (ok: boolean) => {
    if (dialog.kind === "confirm") {
      dialog.resolve(ok);
      onClose();
    }
  };

  const finishPrompt = (result: string | null) => {
    if (dialog.kind === "prompt") {
      dialog.resolve(result);
      onClose();
    }
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    setValue("");
    const t = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [dialog]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dialog.kind === "confirm") finishConfirm(false);
        else finishPrompt(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  const opts = dialog.opts;
  const confirmLabel = opts.confirmLabel ?? "Confirm";
  const cancelLabel = opts.cancelLabel ?? "Cancel";
  const destructive = dialog.kind === "confirm" && dialog.opts.destructive;

  const promptMatch = dialog.kind === "prompt" ? dialog.opts.match : undefined;
  const promptReady =
    dialog.kind !== "prompt" ||
    !promptMatch ||
    value.trim().toLowerCase() === promptMatch.trim().toLowerCase();

  return (
    <>
      <button
        type="button"
        className="sheet-backdrop"
        aria-label="Dismiss"
        onClick={() =>
          dialog.kind === "confirm" ? finishConfirm(false) : finishPrompt(null)
        }
      />
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h3 id={titleId} className="confirm-dialog-title">
          {opts.title}
        </h3>
        {opts.message && <p className="confirm-dialog-message">{opts.message}</p>}
        {opts.detail && <p className="confirm-dialog-detail">{opts.detail}</p>}

        {dialog.kind === "prompt" && (
          <input
            className="app-input confirm-dialog-input"
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={dialog.opts.inputPlaceholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && promptReady) {
                finishPrompt(value.trim());
              }
            }}
          />
        )}

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              dialog.kind === "confirm" ? finishConfirm(false) : finishPrompt(null)
            }
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn${destructive ? " danger" : ""}`}
            disabled={!promptReady}
            onClick={() => {
              if (dialog.kind === "confirm") finishConfirm(true);
              else finishPrompt(value.trim());
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
