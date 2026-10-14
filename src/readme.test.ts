import { describe, expect, it } from 'vitest';
import { renderReadme } from './readme';

const R = 'https://github.com/a/b';
describe('a README in the catalog (ТЗ 37)', () => {
  it('headings, paragraphs, lists, code, marks', () => {
    const h = renderReadme('# Неделя\n\nПлан и **итоги**, *коротко*.\nВторая строка.\n\n- раз\n- два `x`\n\n1. первый\n\n```org\n* TODO <a>\n```\n', R);
    expect(h).toBe('<h2>Неделя</h2>\n<p>План и <b>итоги</b>, <i>коротко</i>. Вторая строка.</p>\n<ul><li>раз</li><li>два <code>x</code></li></ul>\n<ol><li>первый</li></ol>\n<pre><code>* TODO &lt;a&gt;</code></pre>');
  });
  it('no HTML gets through; links only to http(s), relative ones to the repository; an image is a link', () => {
    const h = renderReadme('<script>alert(1)</script>\n\nТекст <img src=x onerror=1> [сайт](https://x.ru/a?b=1&c=2) [плохо](javascript:alert(1)) [доки](docs/a.md)\n\n![Скрин](shot.png)', R);
    expect(h).not.toContain('<script');
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;img src=x onerror=1&gt;');
    expect(h).toContain('<a href="https://x.ru/a?b=1&amp;c=2">сайт</a>');
    expect(h).toContain('плохо');
    expect(h).not.toContain('javascript:');
    expect(h).toContain('<a href="https://github.com/a/b/blob/HEAD/docs/a.md">доки</a>');
    expect(h).toContain('<a href="https://github.com/a/b/blob/HEAD/shot.png" class="img">Картинка: Скрин ↗</a>');
  });
});
