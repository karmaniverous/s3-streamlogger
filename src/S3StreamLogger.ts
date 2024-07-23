import {
  ObjectCannedACL,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
  S3ClientConfig,
  ServerSideEncryption,
  StorageClass,
} from '@aws-sdk/client-s3';
import {
  AssumeRoleCommand,
  AssumeRoleRequest,
  STSClient,
} from '@aws-sdk/client-sts';
import { format as formatDate } from 'date-fns';
import { isString, omit, pick } from 'lodash';
import { hostname } from 'os';
import path from 'path';
import { Writable, WritableOptions } from 'stream';
import { gzip } from 'zlib';

import { getErrorMessage } from './getErrorMessage';

export interface S3StreamLoggerOptions extends WritableOptions {
  access_key_id?: string;
  acl?: ObjectCannedACL;
  bucket?: string;
  buffer_size?: number;
  compress?: boolean;
  folder?: string;
  max_file_size?: number;
  name_format?: string;
  region?: string;
  role_arn?: string;
  role_session_name?: string;
  rotate_every?: number;
  secret_access_key?: string;
  server_side_encryption?: ServerSideEncryption;
  storage_class?: StorageClass;
  tags?: Record<string, string>;
  upload_every?: number;
}

const StreamLoggerProperties = [
  'access_key_id',
  'acl',
  'bucket',
  'buffer_size',
  'compress',
  'folder',
  'max_file_size',
  'name_format',
  'region',
  'role_arn',
  'role_session_name',
  'rotate_every',
  'secret_access_key',
  'server_side_encryption',
  'storage_class',
  'tags',
  'upload_every',
];

export class S3StreamLogger extends Writable {
  private options: S3StreamLoggerOptions = {};
  private s3Client: S3Client;
  private timeout: NodeJS.Timeout | null = null;
  private object_name: string | null = null;
  private file_started: Date | null = null;
  private last_write: Date | null = null;
  private buffers: Buffer[] = [];
  private unwritten = 0;

  constructor(options: S3StreamLoggerOptions) {
    // Partition options.
    super(omit(options, StreamLoggerProperties));
    Object.assign(this.options, pick(options, StreamLoggerProperties));

    // Set defaults.
    this.options.access_key_id ??= process.env.AWS_ACCESS_KEY_ID;
    this.options.bucket ??= process.env.BUCKET_NAME;
    this.options.buffer_size ??= 10000; // 10k
    this.options.compress ??= false;
    this.options.folder ??= '';
    this.options.max_file_size ??= 200000; // 200k
    this.options.name_format ?? `%Y-%m-%d-%H-%M-%S-%L-${hostname()}.log`;
    this.options.region ??= process.env.AWS_REGION;
    this.options.rotate_every ??= 60 * 60 * 1000; // 60 minutes
    this.options.secret_access_key ??= process.env.AWS_SECRET_ACCESS_KEY;
    this.options.server_side_encryption ?? 'AES256';
    this.options.tags ??= {};
    this.options.upload_every ??= 20 * 1000; // 20 seconds

    // Validate options.
    if (!this.options.bucket)
      throw new Error(
        'either options.bucket or process.env.BUCKET_NAME is required',
      );

    const s3ClientConfig: S3ClientConfig = { region: this.options.region };

    if (this.options.access_key_id && this.options.secret_access_key)
      s3ClientConfig.credentials = {
        accessKeyId: this.options.access_key_id,
        secretAccessKey: this.options.secret_access_key,
      };

    this.s3Client = new S3Client(s3ClientConfig);

    this._newFile();
  }

  async assumeRole(options: AssumeRoleRequest): Promise<void> {
    const stsClient = new STSClient({ region: this.options.region });

    try {
      const {
        Credentials: {
          AccessKeyId = '',
          SecretAccessKey = '',
          SessionToken = '',
        } = {},
      } = await stsClient.send(new AssumeRoleCommand(options));

      this.s3Client = new S3Client({
        region: this.options.region,
        credentials: {
          accessKeyId: AccessKeyId,
          secretAccessKey: SecretAccessKey,
          sessionToken: SessionToken,
        },
      });
    } catch (error) {
      throw new Error(`Failed to assume role: ${getErrorMessage(error)}`);
    }
  }

  flushFile(cb: (err?: Error | null) => void): void {
    this._upload(true, cb);
  }

  protected awaitputObject(
    param: PutObjectCommandInput,
    callback: (err: unknown, data?: unknown) => void,
  ): void {
    const command = new PutObjectCommand(param);
    this.s3Client
      .send(command)
      .then((result) => {
        callback(null, result);
      })
      .catch((err: unknown) => {
        callback(err);
      });
  }

  private _upload(
    forceNewFile = false,
    cb?: (err?: Error | null) => void,
  ): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.last_write = new Date();

    const saved = {
      buffers: undefined as Buffer[] | undefined,
      unwritten: this.unwritten,
      object_name: this.object_name,
    };

    this.unwritten = 0;
    const elapsed = new Date().getTime() - (this.file_started?.getTime() ?? 0);
    let reset_buffers = false;
    if (
      forceNewFile ||
      elapsed > this.options.rotate_every! ||
      this._fileSize() > this.options.max_file_size!
    ) {
      saved.buffers = this.buffers;
      reset_buffers = true;
    }

    this._prepareBuffer((err, buffer) => {
      if (err) {
        this._restoreUnwritten(
          saved.unwritten,
          saved.object_name,
          saved.buffers,
        );

        cb?.(err);

        return this.emit('error', err);
      }

      const tagging = new URLSearchParams(this.options.tags).toString();

      const param: PutObjectCommandInput = {
        ACL: this.options.acl,
        Bucket: this.options.bucket,
        ContentType: this.options.compress
          ? 'text/plain;charset=utf-8'
          : undefined,
        Key: saved.object_name!,
        Body: buffer,
        ServerSideEncryption: this.options.server_side_encryption,
        StorageClass: this.options.storage_class,
        Tagging: tagging,
      };

      this.s3Client.send(new PutObjectCommand(param)).catch((err: unknown) => {
        this._restoreUnwritten(
          saved.unwritten,
          saved.object_name,
          saved.buffers,
        );

        cb?.(err as Error | null | undefined);
      });
    });

    if (reset_buffers) {
      this._newFile();
    }
  }

  private _prepareBuffer(
    cb: (err?: Error | null, buffer?: Buffer) => void,
  ): void {
    const buffer = Buffer.concat(this.buffers);
    if (this.options.compress) {
      gzip(buffer, cb);
    } else {
      cb(null, buffer);
    }
  }

  private _fileSize(): number {
    return this.buffers.reduce((s, b) => s + b.length, 0);
  }

  private _newFile(): void {
    this.buffers = [];
    this.file_started = new Date();
    this.last_write = this.file_started;

    this.object_name = path.posix.join(
      this.options.folder!,
      formatDate(this.file_started, this.options.name_format!),
    );
  }

  private _restoreUnwritten(
    unwritten: number,
    object_name: string | null,
    buffers: Buffer[] | undefined,
  ): void {
    this.unwritten += unwritten;
    if (buffers) {
      this.buffers = buffers.concat(this.buffers);
      this.object_name = object_name;
    }
  }

  _write(
    chunk: Buffer | string | null | undefined,
    encoding: BufferEncoding,
    cb?: (error?: Error | null) => void,
  ): void {
    if (isString(chunk)) {
      chunk = Buffer.from(chunk, encoding);
    }

    if (chunk) {
      this.buffers.push(chunk);
      this.unwritten += chunk.length;
    }

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (
      Date.now() - this.last_write!.getTime() > this.options.upload_every! ||
      this.unwritten > this.options.buffer_size!
    ) {
      this._upload();
    } else {
      this.timeout = setTimeout(() => {
        this._upload();
      }, this.options.upload_every);
    }

    if (cb) setImmediate(cb);
  }

  _final(cb: (error?: Error | null) => void): void {
    this._upload(false, cb);
  }
}
