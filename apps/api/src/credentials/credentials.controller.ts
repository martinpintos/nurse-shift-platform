import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { CurrentUser } from "@nestjs/authentication";
import {
  CredentialUploadFieldsSchema,
  IdSchema,
  type Credential,
  type CredentialListResponse,
  type CredentialUploadFields,
} from "@repo/shared";
import type { Response } from "express";
import { Access } from "../auth/access.js";
import type { Principal } from "../auth/principal.js";
import {
  CredentialUploadInterceptor,
  type UploadedLicense,
} from "./credential-upload.interceptor.js";
import { CredentialsService } from "./credentials.service.js";

@Controller("credentials")
export class CredentialsController {
  constructor(
    @Inject(CredentialsService)
    private readonly credentials: CredentialsService,
  ) {}

  /** Multipart: `file` (PDF, PNG or JPEG, by magic bytes) and `expiresOn` (YYYY-MM-DD). */
  @Post()
  @Access("POST /api/credentials")
  @UseInterceptors(CredentialUploadInterceptor)
  upload(
    @CurrentUser() principal: Principal,
    @UploadedFile() file: UploadedLicense | undefined,
    @Body({ schema: CredentialUploadFieldsSchema })
    fields: CredentialUploadFields,
  ): Promise<Credential> {
    return this.credentials.upload(principal, file, fields);
  }

  @Get()
  @Access("GET /api/credentials")
  list(@CurrentUser() principal: Principal): Promise<CredentialListResponse> {
    return this.credentials.list(principal);
  }

  /** Always a download, never rendered inline, with the type detected on upload. */
  @Get(":id/file")
  @Access("GET /api/credentials/:id/file")
  async file(
    @CurrentUser() principal: Principal,
    @Param("id", { schema: IdSchema }) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.credentials.file(principal, id);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return new StreamableFile(file.data, {
      type: file.contentType,
      // Sanitized on upload to [A-Za-z0-9._-], so it needs no quoting beyond this.
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.data.byteLength,
    });
  }
}
