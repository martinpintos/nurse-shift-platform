import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CredentialContentTypeSchema,
  ERROR_MESSAGES,
  type Credential,
  type CredentialListResponse,
  type CredentialUploadFields,
} from "@repo/shared";
import { recordAudit } from "../audit/audit.js";
import type { Principal } from "../auth/principal.js";
import { Clock, utcToday } from "../common/clock.js";
import type { Credential as CredentialRow } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { formatDbDate, parseDbDate } from "../shifts/shift.mapper.js";
import type { UploadedLicense } from "./credential-upload.interceptor.js";
import { detectContentType, sanitizeFileName } from "./file-type.js";

/** Every column but the file bytes, which only the download reads. */
const metadata = {
  id: true,
  nurseId: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  expiresOn: true,
  uploadedAt: true,
} as const;

type CredentialMetadata = Omit<CredentialRow, "data">;

/** `valid` while `expiresOn` is today (UTC) or later. Claims check the shift date instead. */
export function toCredentialDto(
  row: CredentialMetadata,
  today: string,
): Credential {
  const expiresOn = formatDbDate(row.expiresOn);
  return {
    id: row.id,
    nurseId: row.nurseId,
    fileName: row.fileName,
    contentType: CredentialContentTypeSchema.parse(row.contentType),
    sizeBytes: row.sizeBytes,
    expiresOn,
    uploadedAt: row.uploadedAt.toISOString(),
    status: expiresOn >= today ? "valid" : "expired",
  };
}

export interface CredentialFile {
  fileName: string;
  contentType: string;
  data: Uint8Array;
}

@Injectable()
export class CredentialsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async upload(
    nurse: Principal,
    file: UploadedLicense | undefined,
    fields: CredentialUploadFields,
  ): Promise<Credential> {
    if (!file || file.size === 0) {
      throw new BadRequestException(ERROR_MESSAGES.credentialFileRequired);
    }
    const contentType = detectContentType(file.buffer);
    if (!contentType) {
      throw new BadRequestException(ERROR_MESSAGES.credentialFileType);
    }
    const today = utcToday(this.clock);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.credential.create({
        data: {
          nurseId: nurse.id,
          fileName: sanitizeFileName(file.originalname, contentType),
          contentType,
          sizeBytes: file.buffer.byteLength,
          data: new Uint8Array(file.buffer),
          expiresOn: parseDbDate(fields.expiresOn),
        },
        select: metadata,
      });
      const credential = toCredentialDto(row, today);
      await recordAudit(tx, nurse, {
        action: "credential.uploaded",
        entityType: "credential",
        entityId: row.id,
        details: { contentType, status: credential.status },
      });
      return credential;
    });
  }

  /** A nurse sees her own; the admin sees everyone's. Newest first per nurse. */
  async list(principal: Principal): Promise<CredentialListResponse> {
    const rows = await this.prisma.credential.findMany({
      where: principal.role === "admin" ? {} : { nurseId: principal.id },
      select: metadata,
      orderBy: [{ nurseId: "asc" }, { uploadedAt: "desc" }, { id: "asc" }],
    });
    const today = utcToday(this.clock);
    return { credentials: rows.map((row) => toCredentialDto(row, today)) };
  }

  /**
   * The document, for its owner or the admin. Anyone else gets the same 404 as for an
   * unknown id, so ids can't be probed.
   */
  async file(principal: Principal, id: string): Promise<CredentialFile> {
    const row = await this.prisma.credential.findUnique({
      where: { id },
      select: { nurseId: true, fileName: true, contentType: true, data: true },
    });
    if (!row || (principal.role !== "admin" && row.nurseId !== principal.id)) {
      throw new NotFoundException(ERROR_MESSAGES.credentialNotFound);
    }
    return row;
  }
}
