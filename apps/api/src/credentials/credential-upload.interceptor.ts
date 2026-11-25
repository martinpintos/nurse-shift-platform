import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  CREDENTIAL_FILE_FIELD,
  ERROR_MESSAGES,
  MAX_CREDENTIAL_BYTES,
} from "@repo/shared";
import type { Observable } from "rxjs";

/** What this route reads from multer's in-memory file. */
export interface UploadedLicense {
  originalname: string;
  size: number;
  buffer: Buffer;
}

// Memory storage (multer's default without `dest`): the bytes go to Postgres, never disk.
const MulterInterceptor = FileInterceptor(CREDENTIAL_FILE_FIELD, {
  // Browsers send file names as UTF-8; multer's default would read them as latin1.
  defParamCharset: "utf8",
  limits: {
    fileSize: MAX_CREDENTIAL_BYTES,
    files: 1,
    // `expiresOn` is the only text field.
    fields: 2,
    fieldSize: 1024,
    parts: 4,
  },
});

/**
 * Parses the multipart body of POST /api/credentials (one `file`, at most
 * MAX_CREDENTIAL_BYTES) and answers an oversize file with the contract's 413 message.
 */
@Injectable()
export class CredentialUploadInterceptor implements NestInterceptor {
  private readonly multer: NestInterceptor = new MulterInterceptor();

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      return await this.multer.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new PayloadTooLargeException(
          ERROR_MESSAGES.credentialFileTooLarge,
        );
      }
      throw error;
    }
  }
}
