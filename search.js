const axios = require('axios');
const cheerio = require('cheerio');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

let visitedUrls = new Set();
let crawlResults = [];
const resultsDir = './results';
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir);
}
const crawlFile = path.join(resultsDir, 'crawlResults.json');
const searchFile = path.join(resultsDir, 'searchResults.json');
let rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

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
      const termOccurrenceScore = 5 * termOccurrence;
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

async function displayResults() {
  let table = new Table({
    head: ['URL', 'Ocorrências', 'Popularidade', 'Autorreferência', 'Total'],
  });

  try {
    searchResults = JSON.parse(fs.readFileSync(searchFile, 'utf8'));
    searchResults.forEach(page => {
      if (page.termOccurrence) {
        table.push([
          page.url,
          page.termOccurrenceScore,
          page.outerReferenceScore,
          page.selfReferenceScore,
          page.totalScore,
        ])
      }
    });

    console.log(table.toString());

  } catch (error) {
    console.error('Erro na display\n');
  }
}

async function askUser(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  // let urlPage = 'https://hmccl.github.io/sci-fi/duna.html';
  // let urlPage = 'http://127.0.0.1:8000/sci-fi/2001.html';
  // let searchTerm = 'viagem';
  let urlPage = await askUser('Endereço da página inicial:\n');

  try {
    while (true) {
      let searchTerm = await askUser('Termo de busca:\n');
      await crawlPage(urlPage);
      await searchPage(searchTerm);
      await displayResults();
    }
  } catch (error) {
    console.error('Erro na execução\n');
  }
}

main();

