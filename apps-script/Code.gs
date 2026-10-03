/**
 * なろうReader用・個人利用プロキシ
 * Google Apps Script の「ウェブアプリ」としてデプロイして使います。
 */
function doGet(e) {
  var callback = String((e && e.parameter && e.parameter.callback) || 'narouReaderCallback');
  if (!/^[A-Za-z_$][0-9A-Za-z_$\.]{0,80}$/.test(callback)) callback = 'narouReaderCallback';

  try {
    var rawUrl = String((e && e.parameter && e.parameter.url) || '');
    if (!/^https:\/\/ncode\.syosetu\.com\/n[0-9a-z]+\/\d+\/?(?:[?#].*)?$/i.test(rawUrl)) {
      return jsonp_(callback, { ok: false, error: '対応している各話URLではありません。' });
    }

    var response = UrlFetchApp.fetch(rawUrl, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; personal-narou-reader/0.3)',
        'Accept-Language': 'ja,en;q=0.8'
      }
    });

    var status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      return jsonp_(callback, { ok: false, error: 'ページ取得に失敗しました。HTTP ' + status });
    }

    return jsonp_(callback, {
      ok: true,
      sourceUrl: rawUrl,
      html: response.getContentText('UTF-8')
    });
  } catch (err) {
    return jsonp_(callback, { ok: false, error: 'ページ取得に失敗しました。', detail: String(err) });
  }
}

function jsonp_(callback, data) {
  var text = callback + '(' + JSON.stringify(data).replace(/<\//g, '<\\/') + ');';
  return ContentService.createTextOutput(text)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
