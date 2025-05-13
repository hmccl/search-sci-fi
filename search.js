const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

let visitedUrls = new Set();
let crawlResults = [];
const crawlFile = './results/crawlResults.json';
const searchFile = './results/searchResults.json';

async function crawlPage(url) {
  // queue of links
  let queue = [url];

  while (queue.length > 0) {
    // next link
    const url = queue.shift();

    // skip if link visited
    if (visitedUrls.has(url)) {
      continue;
    }

    // save if link not visited
    visitedUrls.add(url);

    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      const links = $('a');
      const content = $.html();
      let hyperlinks = [];

      links.each((i, ele) => {
        const href = $(ele).attr('href');
        if (href) {
          // absolute url
          const absoluteUrl = new URL(href, url).href;
          hyperlinks.push(absoluteUrl);

          // push new link to queue
          if (!visitedUrls.has(absoluteUrl)) {
            queue.push(absoluteUrl);
          }
        }
      });

      crawlResults.push({ url, content, hyperlinks });
      fs.writeFileSync(crawlFile, JSON.stringify(crawlResults, null, "\t"));

    } catch (err) {
      console.error('Erro na varredura\n');
    }
  }
}

// score
// plus 10 points for each outer reference
// minus 15 points for each self reference
// plus 5 points for each term occurrence
// order by (desc)
// total score
// outer reference score
// term occurrence score
// self reference score
async function searchPage(term) {
  let rankingData = [];
  try {
    crawlResults = JSON.parse(fs.readFileSync(crawlFile, 'utf8'));
    crawlResults.forEach(page => {
      let outerReference = 0;
      crawlResults.forEach(outerPage => {
        if (outerPage.url !== page.url && outerPage.hyperlinks.includes(page.url)) {
          outerReference++;
        }
      });

      let termOccurrence = 0;
      const regexp = new RegExp(term, 'gi');
      const matches = page.content.match(regexp);
      termOccurrence = matches ? matches.length : 0;

      let selfReference = 0;
      page.hyperlinks.forEach(hyperlink => {
        if (hyperlink === page.url) {
          selfReference++;
        }
      });

      const outerReferenceScore = 10 * outerReference;
      const termOccurrenceScore = 10 * termOccurrence;
      const selfReferenceScore = -15 * selfReference;
      const totalScore = outerReferenceScore + termOccurrenceScore + selfReferenceScore;

      rankingData.push({
        url: page.url,
        totalScore,
        outerReferenceScore,
        outerReference,
        termOccurrenceScore,
        termOccurrence,
        selfReferenceScore,
        selfReference
      });
    });

    rankingData.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }

      if (b.outerReferenceScore !== a.outerReferenceScore) {
        return b.outerReferenceScore - a.outerReferenceScore;
      }

      if (b.termOccurrenceScore !== a.termOccurrenceScore) {
        return b.termOccurrenceScore - a.termOccurrenceScore;
      }

      return b.selfReferenceScore - a.selfReferenceScore;
    });

    fs.writeFileSync(searchFile, JSON.stringify(rankingData, null, "\t"));

  } catch (error) {
    console.error('Erro na busca\n');
  }
}

async function main(url, term) {
  try {
    await crawlPage(url);
    await searchPage(term);

  } catch (error) {
    console.error('Erro na execução\n');
  }
}

// python3 -m http.server

// let urlPage = 'https://hmccl.github.io/sci-fi/duna.html';
let urlPage = 'http://127.0.0.1:8000/sci-fi/2001.html';
let searchTerm = 'ficção científica';

main(urlPage, searchTerm);
