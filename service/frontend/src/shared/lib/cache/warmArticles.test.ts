import { describe, expect, it } from 'vitest';
import { localOrigin } from './warmArticles';

describe('localOrigin', () => {
  it('Fargate처럼 HOSTNAME이 태스크 이름이면 그 주소로 접속한다', () => {
    expect(localOrigin({ HOSTNAME: 'ip-172-31-65-78.ec2.internal', PORT: '3000' })).toBe('http://ip-172-31-65-78.ec2.internal:3000');
  });

  it('HOSTNAME이 없거나 0.0.0.0이면 127.0.0.1', () => {
    expect(localOrigin({})).toBe('http://127.0.0.1:3000');
    expect(localOrigin({ HOSTNAME: '0.0.0.0', PORT: '4000' })).toBe('http://127.0.0.1:4000');
  });
});
