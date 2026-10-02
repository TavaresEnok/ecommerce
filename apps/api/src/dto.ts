import { IsEmail, IsString, Length, Matches, IsUUID, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
const trim = ({value}:{value:unknown}) => typeof value==='string'?value.trim():value;
export class EmailDto { @Transform(trim) @IsEmail() @Length(3,254) email!: string; }
export class CredentialsDto extends EmailDto { @IsString() @Length(12,128) password!: string; }
export class TokenDto { @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string; }
export class RecoveryDto extends TokenDto { @IsString() @Length(12,128) password!: string; }
export class CreateStoreDto {
  @Transform(trim) @IsString() @Length(1,100) name!: string;
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @Length(3,50) slug!: string;
}
export class SettingsDto {
  @Transform(trim) @IsString() @Length(1,100) displayName!: string;
  @IsIn(['America/Sao_Paulo','America/Manaus','America/Recife','America/Fortaleza','America/Belem','America/Rio_Branco','America/Cuiaba','UTC']) timezone!: string;
}
export class AcceptInviteDto extends TokenDto { @IsUUID('7') tenantId!: string; }
