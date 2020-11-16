webelapse: Generate time-lapse video for a website
======

webelapse is a Node.js program that can be used to generate time-lapse video of a website. Possible use cases are helping to review/test/demo web application functionality before releasing to production or building screencasts of frequently updated websites.

![demo](https://raw.githubusercontent.com/neuml/webelapse/master/demo.gif)

webelapse has the following features:
 - Generate time-lapse video for a given website/URL
 - Account for duplicate/near duplicate frames and remove them from the output
 - Exponentially back off the next scheduled execution time if the content is not changing up to a max timeout interval
 - Generate video after times of frequent change and a return to static content

## Installation
webelapse can be installed via npm

    npm install -g webelapse

This package assumes [ffmpeg](https://www.ffmpeg.org/) is installed and available on the user's PATH. ffmpeg is required to generate videos.

## Examples
Take a screenshot of a website on localhost, store files in directory named output and exit.

    webelapse -u http://localhost:8080 -o output

Take a screenshot of a website on localhost every minute (60 seconds). Duplicate frames discarded. No video built.

    webelapse -u http://localhost:8080 -o output -s 60

Record a stream of a website on localhost, taking screenshots every minute (60 seconds). Build video every 30 frames.
 
    webelapse -u http://localhost:8080 -o output -s 60 -f 30

Record a stream of a website on localhost, taking screenshots every minute (60 seconds). Exponentially back off static content, increasing the interval for static content up to 1800 seconds (30 minutes) between frames. Video built dynamically once max backoff time reached.

    webelapse -u http://localhost:8080 -o output -s 60 -m 1800

Same as previous but will consider frames a duplicate if its hash is within an edit distance of 2. Default is to require an exact image hash, which will resolve to the same hash for near duplicate images.

    webelapse -u http://localhost:8080 -o output/desktop -d 2 -s 60 -m 1800

Show all options.

    webelapse --help

## Other installation methods

If you do not want to install the package globally, it can be installed in a local directory and executed as (instead of webelapse):

    npm install webelapse
    node node_modules/webelapse/record.js

Alternatively, you can use Git to clone the repository from GitHub:

    git clone https://github.com/davidmezzetti/webelapse.git
    cd webelapse
    npm update
    node record.js

## Background

Screenshots and screencasts of a website are common and there are a number of packages out there built on either Selenium or Puppeteer. This package adds duplicate and near duplicate detection, to only record dynamic activity. This package is designed to work with websites that frequently update without user action, such as a live dashboard. Duplicate detection eliminates extremely long videos with nothing changing, while allowing you to see what is changing fast.

webelapse uses [Puppeteer](https://www.npmjs.com/package/puppeteer) for web automation and perceptual hashing via [imghash](https://www.npmjs.com/package/imghash) for near duplicate detection. Block mean perceptual hashing is designed to generate similar hashes for similar images. If a webpage has a single line of text updated, such as a timestamp, those frames can ignored. [ffmpeg](https://www.ffmpeg.org/) is used for encoding output videos and it is required to be installed on the user's PATH.

## Security

webelapse is built on Puppeteer, which is built on the Chromium web stack. While Chromium has many security measures built in, you should still trust the source of URLs browsed as they will be loaded on your machine locally to render screenshots.

webelapse has features such as exponential backoff to increase the scheduled run frequency when content is static. Common sense should be used to only schedule the run frequency to what is necessary.

## License
MIT