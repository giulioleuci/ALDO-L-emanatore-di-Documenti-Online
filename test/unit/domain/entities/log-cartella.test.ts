import { LogCartella } from '../../../../src/domain/entities/LogCartella';
import { COL_LOG_FOLD } from '../../../../src/config/schema';

test('getLink returns COL_LOG_FOLD.LINK', () => {
  const f = LogCartella.fromData({
    [COL_LOG_FOLD.ID]: 'folder1',
    [COL_LOG_FOLD.LINK]: 'https://drive.google.com/drive/folders/folder1'
  });
  expect(f.getLink()).toBe('https://drive.google.com/drive/folders/folder1');
});

test('getLink returns empty string when LINK is absent', () => {
  const f = LogCartella.fromData({ [COL_LOG_FOLD.ID]: 'folder1' });
  expect(f.getLink()).toBe('');
});
