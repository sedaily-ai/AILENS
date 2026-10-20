import { expect, test } from 'vitest';
import { parseStoredSelection } from './birthdaySession';

test('새로고침 때 되살리는 생일은 형식·날짜·보기 종류를 검증한다', () => {
  expect(parseStoredSelection('{"date":"2000-03-18","mode":"personal"}')).toEqual({ date: '2000-03-18', mode: 'personal' });
  for (const raw of [null, '', '{', 'null', '"1996-06-01"', '{"date":"1996-02-30","mode":"personal"}', '{"date":"2999-01-01","mode":"personal"}',
    '{"date":"1996-06-01","mode":"year"}', '{"date":"1996-06-01","mode":"example"}', '{"date":"1996-06-01","mode":"admin"}', '{"date":19960601,"mode":"personal"}', '{"date":"1996-06-01<script>","mode":"personal"}']) {
    expect(parseStoredSelection(raw)).toBeNull();
  }
});
