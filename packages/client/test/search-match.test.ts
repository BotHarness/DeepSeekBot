import { describe, expect, it } from 'vitest';
import { searchTextMatches, searchTextScore } from '../src/client/search-match.js';

describe('search text matching', () => {
  it('ranks exact, prefix, word and inner matches before pinyin', () => {
    expect(searchTextScore('Launch', 'launch')).toBe(0);
    expect(searchTextScore('Launch plan', 'LAUNCH')).toBe(1);
    expect(searchTextScore('Q4 launch', 'launch')).toBe(2);
    expect(searchTextScore('relaunch', 'launch')).toBe(3);
    expect(searchTextScore('产品发布', '发布')).toBe(3);
    expect(searchTextScore('产品发布', 'chanpin')).toBe(4);
    expect(searchTextScore('产品发布', 'fabu')).toBe(5);
    expect(searchTextScore('Launch', '   ')).toBeUndefined();
  });

  it('matches full pinyin, initials, mixed text and polyphones', () => {
    expect(searchTextMatches('张三', 'zhangsan')).toBe(true);
    expect(searchTextMatches('张三', 'zs')).toBe(true);
    expect(searchTextMatches('张三', 'zhang san')).toBe(true);
    expect(searchTextMatches('研发 Bot', 'yfb')).toBe(true);
    expect(searchTextMatches('长期记忆', 'changqi')).toBe(true);
    expect(searchTextMatches('重要群', 'zhongyao')).toBe(true);
    expect(searchTextMatches('张三', 'lisi')).toBe(false);
    expect(searchTextMatches('Alice', 'zs')).toBe(false);
    expect(searchTextMatches('张三', '李')).toBe(false);
  });
});
