import { Module } from "@nestjs/common";
import { CredentialUploadInterceptor } from "./credential-upload.interceptor.js";
import { CredentialsController } from "./credentials.controller.js";
import { CredentialsService } from "./credentials.service.js";

@Module({
  controllers: [CredentialsController],
  providers: [CredentialsService, CredentialUploadInterceptor],
})
export class CredentialsModule {}
