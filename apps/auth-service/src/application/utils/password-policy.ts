import { BadRequestException } from "@nestjs/common";

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&\-_#^()]).{8,128}$/;

export function validatePasswordPolicy(password: string): void {
  if (!PASSWORD_REGEX.test(password)) {
    throw new BadRequestException(
      "Password must be 8–128 characters and contain at least one uppercase letter, one lowercase letter, one digit, and one special character (@$!%*?&-_#^()).",
    );
  }
}
