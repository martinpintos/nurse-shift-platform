"use client";

import {
  CREDENTIAL_CONTENT_TYPES,
  ERROR_MESSAGES,
  IsoDateSchema,
  MAX_CREDENTIAL_BYTES,
  SUCCESS_MESSAGES,
  TEST_IDS,
  type Credential,
} from "@repo/shared";
import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Badge } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { saveBlob } from "../../lib/download";
import { formatBytes, formatDateTime, formatPlainDate } from "../../lib/format";
import { useNotifications } from "../../lib/notifications";
import { useApi } from "../../lib/session";
import { useAction } from "../../lib/use-action";

/** Client-side only: the expiry field is empty or not a real date. */
export const EXPIRY_REQUIRED_MESSAGE = "Enter the license expiry date";

const EXTENSION_TYPES: Record<
  string,
  (typeof CREDENTIAL_CONTENT_TYPES)[number]
> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const ACCEPT = [
  ...CREDENTIAL_CONTENT_TYPES,
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
].join(",");

function contentTypeOf(file: File): string {
  if (file.type) return file.type;
  // Some systems report no MIME type; fall back to the extension. The API checks the bytes.
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? "";
}

/** The banner message for a file the API would refuse, or null if it's fine to send. */
export function credentialFileProblem(file: File): string | null {
  if (file.size === 0) return ERROR_MESSAGES.credentialFileRequired;
  const type = contentTypeOf(file);
  if (!(CREDENTIAL_CONTENT_TYPES as readonly string[]).includes(type)) {
    return ERROR_MESSAGES.credentialFileType;
  }
  if (file.size > MAX_CREDENTIAL_BYTES)
    return ERROR_MESSAGES.credentialFileTooLarge;
  return null;
}

/**
 * Whether an expiry value is complete enough to upload on its own. Typing a year into a
 * date field passes through 0002, 0020 and 0202 before 2027, so partial years don't fire.
 */
function isCompleteExpiry(value: string): boolean {
  return (
    IsoDateSchema.safeParse(value).success && Number(value.slice(0, 4)) >= 2000
  );
}

function credentialTone(credential: Credential) {
  return credential.status === "valid" ? "success" : "danger";
}

/** The newest-expiring credential: the one claims are checked against. */
function currentCredential(credentials: Credential[]): Credential | undefined {
  return [...credentials].sort((a, b) =>
    b.expiresOn.localeCompare(a.expiresOn),
  )[0];
}

export function CredentialStatusNote({
  credentials,
}: {
  credentials: Credential[] | undefined;
}) {
  if (!credentials) return null;
  const current = currentCredential(credentials);
  if (!current) {
    return (
      <p className="callout" data-tone="warning">
        No license on file. Upload your license to claim shifts.
      </p>
    );
  }
  if (current.status === "expired") {
    return (
      <p className="callout" data-tone="danger">
        Your license expired on {formatPlainDate(current.expiresOn)}. Upload a
        renewed license to claim shifts.
      </p>
    );
  }
  return (
    <p className="callout" data-tone="success">
      License valid until {formatPlainDate(current.expiresOn)}. Claims are
      checked against each shift’s date.
    </p>
  );
}

export function CredentialsPanel({
  credentials,
  onUploaded,
}: {
  credentials: Credential[];
  onUploaded: () => void;
}) {
  const api = useApi();
  const { notifyError } = useNotifications();
  const { run, pending } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [expiresOn, setExpiresOn] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // A ref, not state: two change events in one tick must not start two uploads.
  const uploading = useRef(false);
  const fileId = useId();
  const expiryId = useId();
  const hintId = useId();

  async function upload(nextFile: File, nextExpiry: string) {
    if (uploading.current) return;
    uploading.current = true;
    const done = await run(
      "upload",
      () => api.uploadCredential(nextFile, nextExpiry),
      SUCCESS_MESSAGES.credentialUploaded,
    );
    uploading.current = false;
    if (done) {
      setFile(null);
      setExpiresOn("");
      if (fileInput.current) fileInput.current.value = "";
      onUploaded();
    }
  }

  /** Uploads as soon as both fields hold a value; the button does the same on demand. */
  function uploadWhenReady(nextFile: File | null, nextExpiry: string) {
    if (nextFile && isCompleteExpiry(nextExpiry))
      void upload(nextFile, nextExpiry);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }
    const problem = credentialFileProblem(selected);
    if (problem) {
      notifyError(problem);
      event.target.value = "";
      setFile(null);
      return;
    }
    setFile(selected);
    uploadWhenReady(selected, expiresOn);
  }

  function onExpiryChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setExpiresOn(value);
    uploadWhenReady(file, value);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      notifyError(ERROR_MESSAGES.credentialFileRequired);
      return;
    }
    if (!IsoDateSchema.safeParse(expiresOn).success) {
      notifyError(EXPIRY_REQUIRED_MESSAGE);
      return;
    }
    void upload(file, expiresOn);
  }

  async function download(credential: Credential) {
    if (downloadingId) return;
    setDownloadingId(credential.id);
    try {
      saveBlob(
        await api.downloadCredential(credential.id),
        credential.fileName,
      );
    } catch (error) {
      notifyError(errorMessage(error));
    } finally {
      setDownloadingId(null);
    }
  }

  const busy = pending !== null;

  return (
    <>
      <form
        className="upload-form"
        onSubmit={onSubmit}
        aria-describedby={hintId}
      >
        <p id={hintId} className="field-hint">
          PDF, PNG or JPEG, up to {formatBytes(MAX_CREDENTIAL_BYTES)}. It
          uploads as soon as you pick a file and an expiry date.
        </p>
        <div className="field">
          <label htmlFor={fileId}>License document</label>
          <input
            ref={fileInput}
            id={fileId}
            className="input input-file"
            type="file"
            name="file"
            accept={ACCEPT}
            onChange={onFileChange}
            data-testid={TEST_IDS.credentialUploadInput}
          />
        </div>
        <div className="field">
          <label htmlFor={expiryId}>Expiry date</label>
          <input
            id={expiryId}
            className="input"
            type="date"
            name="expiresOn"
            placeholder="YYYY-MM-DD"
            value={expiresOn}
            onChange={onExpiryChange}
            data-testid={TEST_IDS.credentialExpiryDateInput}
          />
        </div>
        <button
          type="submit"
          className="btn btn-secondary"
          aria-disabled={busy || undefined}
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </form>

      {credentials.length === 0 ? (
        <p className="section-state muted">
          No license documents uploaded yet.
        </p>
      ) : (
        <ul className="credential-list" aria-label="Your license documents">
          {credentials.map((credential) => (
            <li key={credential.id} className="credential-item">
              <div className="credential-main">
                <span className="credential-name">{credential.fileName}</span>
                <span className="muted small">
                  {formatBytes(credential.sizeBytes)} · uploaded{" "}
                  {formatDateTime(credential.uploadedAt)}
                </span>
              </div>
              <div className="credential-meta">
                <span className="small">
                  Expires{" "}
                  <strong>{formatPlainDate(credential.expiresOn)}</strong>
                </span>
                <Badge tone={credentialTone(credential)}>
                  {credential.status}
                </Badge>
                <button
                  type="button"
                  className="btn btn-link btn-small"
                  aria-label={`Download ${credential.fileName}`}
                  aria-disabled={downloadingId === credential.id || undefined}
                  onClick={() => void download(credential)}
                >
                  {downloadingId === credential.id
                    ? "Downloading…"
                    : "Download"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
