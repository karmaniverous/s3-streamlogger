import { expect } from 'chai';

import { S3StreamLogger } from './S3StreamLogger';

describe('S3StreamLogger', function () {
  it('should initialize', function () {
    new S3StreamLogger({ bucket: 'foo' });
    expect(true).to.be.true;
  });
});
