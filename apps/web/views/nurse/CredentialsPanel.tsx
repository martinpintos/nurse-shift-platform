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
import { StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";
import styles from "./CredentialsPanel.module.css";
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

/** The newest-expiring credential: the one claims are checked against. */
export function currentCredential(
  credentials: Credential[],
): Credential | undefined {
  return [...credentials].sort((a, b) =>
    b.expiresOn.localeCompare(a.expiresOn),
  )[0];
}

/** One line on whether the nurse can claim: valid until, expired on, or nothing on file. */
export function CredentialStatusNote({
  credentials,
}: {
  credentials: Credential[] | undefined;
}) {
  if (!credentials) return null;
  const current = currentCredential(credentials);
  if (!current) {
    return (
      <p className={styles.status} data-tone="warning">
        No license on file. Upload your license to claim shifts.
      </p>
    );
  }
  if (current.status === "expired") {
    return (
      <p className={styles.status} data-tone="danger">
        Your license expired on {formatPlainDate(current.expiresOn)}. Upload a
        renewed license to claim shifts.
      </p>
    );
  }
  return (
    <p className={styles.status} data-tone="success">
      Valid until {formatPlainDate(current.expiresOn)}
    </p>
  );
}

/** Earlier documents beyond this many are behind "Show all". */
const VISIBLE_DOCUMENTS = 1;

/**
 * The license card: upload a renewal (it uploads by itself once a file and an expiry date
 * are set), and the documents on file. The uploaded credential from the API's response is
 * handed to `onUploaded` before the success toast.
 */
export function CredentialsPanel({
  credentials,
  onUploaded,
}: {
  credentials: Credential[];
  onUploaded: (credential: Credential) => void;
}) {
  const api = useApi();
  const { notifyError } = useNotifications();
  const { run, pending } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [expiresOn, setExpiresOn] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
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
      { success: SUCCESS_MESSAGES.credentialUploaded, apply: onUploaded },
    );
    uploading.current = false;
    if (done) {
      setFile(null);
      setExpiresOn("");
      if (fileInput.current) fileInput.current.value = "";
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
  const sorted = [...credentials].sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt),
  );
  const visible = showAll ? sorted : sorted.slice(0, VISIBLE_DOCUMENTS);
  const hidden = sorted.length - visible.length;

  return (
    <div className={styles.panel}>
      <div className={styles.onFile}>
        <CredentialStatusNote credentials={credentials} />
        {sorted.length === 0 ? (
          <p className={styles.none}>No license documents uploaded yet.</p>
        ) : (
          <div className={styles.documents}>
            <ul className={styles.list} aria-label="Your license documents">
              {visible.map((credential) => (
                <li key={credential.id} className={styles.document}>
                  <div className={styles.documentMain}>
                    <span className={styles.fileName}>
                      {credential.fileName}
                    </span>
                    <span className={styles.meta}>
                      Expires{" "}
                      <strong>{formatPlainDate(credential.expiresOn)}</strong>
                      {" · "}
                      {formatBytes(credential.sizeBytes)}
                      {" · uploaded "}
                      {formatDateTime(credential.uploadedAt)}
                    </span>
                  </div>
                  <div className={styles.documentActions}>
                    <StatusBadge kind="credential" status={credential.status} />
                    <Button
                      size="sm"
                      variant="secondary"
                      busy={downloadingId === credential.id}
                      aria-label={`Download ${credential.fileName}`}
                      onClick={() => void download(credential)}
                    >
                      {downloadingId === credential.id
                        ? "Downloading…"
                        : "Download"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {hidden > 0 || showAll ? (
              <button
                type="button"
                className={styles.more}
                aria-expanded={showAll}
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll ? "Show fewer" : `Show all ${sorted.length} documents`}
              </button>
            ) : null}
          </div>
        )}
      </div>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.field}>
          <label htmlFor={fileId} className={styles.label}>
            Upload a renewal
          </label>
          <Input
            ref={fileInput}
            id={fileId}
            type="file"
            name="file"
            accept={ACCEPT}
            aria-describedby={hintId}
            onChange={onFileChange}
            data-testid={TEST_IDS.credentialUploadInput}
          />
          <p id={hintId} className={styles.hint}>
            PDF, PNG or JPEG, up to {formatBytes(MAX_CREDENTIAL_BYTES)}. It
            uploads once the expiry date is set.
          </p>
        </div>
        <div className={styles.expiryRow}>
          <div className={styles.field}>
            <label htmlFor={expiryId} className={styles.label}>
              Expiry date
            </label>
            <Input
              id={expiryId}
              type="date"
              name="expiresOn"
              placeholder="YYYY-MM-DD"
              value={expiresOn}
              onChange={onExpiryChange}
              data-testid={TEST_IDS.credentialExpiryDateInput}
            />
          </div>
          <Button type="submit" variant="secondary" busy={busy}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </form>
    </div>
  );
}
