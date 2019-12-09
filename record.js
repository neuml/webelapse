#!/usr/bin/env node

/**
 *  Node.js script that uses puppeteer to generate time lapse video for a web page. It has the following features:
 *
 *  - Generate time-lapse video for a given website/URL
 *  - Account for duplicate/near duplicate frames and remove them from the output
 *  - Exponentially back off the next scheduled execution time if the content is not changing up to a max timeout interval
 *  - Generate video after times of frequent change and a return to static content
 */

const argv = require("commander");
const child = require("child_process");
const fs = require("fs");
const imghash = require("imghash");
const leven = require("leven");
const moment = require("moment");
const path = require("path");
const puppeteer = require("puppeteer");
const util = require("util");

// Create promise based versions of functions to work in async mode
const exec = util.promisify(child.exec);
const readdir = util.promisify(fs.readdir);
const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);

// Command line argument parsing
argv.requiredOption("-o --output <output directory>", "Output directory (required)");
argv.requiredOption("-u --url <url>", "URL to record (required)");
argv.option("-b --bits <bits>", "Hash bits per row. Defaults to 12. Larger sizes are more sensitive to small image changes", parseInt);
argv.option("-c --color <theme>", "Media color theme to set (light or dark). Defaults to light.");
argv.option("-d --distance <distance>", "Edit distance between hashes to be considered a duplicate. Defaults to 0.", parseInt);
argv.option("-e --encoding <output encoding", "Output file encoding. Defaults to mp4");
argv.option("-f --frames <count>", "Number of frames to use for each video. If empty, will only generate video between active times.", parseInt);
argv.option("-m --max <seconds>", "Maximum time to wait to schedule in seconds. Defaults to 1 day max.", parseInt);
argv.option("-s --schedule <seconds>", "Generate file every S seconds, with exponential backoff on static content", parseInt);
argv.option("-w --width <window width>", "Browser view width", parseInt);
argv.option("-t --height <window height>", "Browser view height", parseInt);

argv.parse(process.argv);

let hash = null;
let frames = [];
let duplicates = 0;

/**
 * Initializes a new run. Attempts to recover frames from a previous partial run.
 */
async function init() {
  // Read output directory for frames from previous runs
  let files = await readdir(argv.output)

  if (files && files.length > 0) {
    files = files.filter(f => /webelapse\-\d+\.png/.test(f));

    for (let x = 0; x < files.length; x++) {
      frames.push(path.join(argv.output, files[x]));
    }

    // Ensure frames are sorted
    frames.sort();
  }

  if (frames.length > 0) {
    // Get hash from last frame
    hash = await imghash.hash(frames[frames.length - 1], argv.bits || 12);

    log(util.format("Recovered %d frames from previous run", frames.length));
    log("Recovered hash " + hash);
  }
}

/**
 * Generates a single frame. This method only keeps the new frame if it has a 
 * different perceptual hash from the previous frame.
 */
async function run() {
  // Generate output path
  const output = path.join(argv.output, "webelapse-" + new Date().getTime() + ".png");

  // Get frame data
  let data = await frame(output);

  // Build image hash to detect difference from previous frame
  let newhash = await imghash.hash(data, argv.bits || 12);
  let distance = argv.distance || 0;

  // Check if the frame hash is a duplicate or near duplicate of the previous frame hash
  if (!hash || leven(hash, newhash) > distance) {
    // Write data to file
    await writeFile(output, data);

    log(util.format("Wrote frame: %s, hash: %s", output, newhash));
    frames.push(output);
    duplicates = 0;
  }
  else {
    log(util.format("Duplicate hash %s", newhash));
    duplicates++;
  }

  // Store new hash
  hash = newhash;

  // Schedule next execution
  schedule();
}

/**
 * Logs a message to the console.
 * 
 * @param message message to log
 */
function log(message) {
  const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
  console.log(timestamp + " - " + message)
}

/**
 * Schedules the next execution run, if scheduling is enabled.
 */
async function schedule() {
  if (argv.schedule) {
    // Default timeout in seconds
    let timeout = argv.schedule * 1000;

    // Default max timeout is 1 day if not provided
    let max = argv.max ? argv.max * 1000 : 1000 * 60 * 60 * 24;

    // Exponential backoff up to maximum time
    timeout = Math.min(duplicates > 0 ? timeout * Math.pow(2, duplicates) : timeout, max);

    // Build video if activity has went from dynamic to static or the number of frames has elapsed
    if ((frames.length >= 10 && timeout >= max) || (argv.frames && frames.length >= argv.frames)) {
      await video();

      // Reset parameters
      hash = null;
      frames = [];
      duplicates = 0;
    }

    setTimeout(run, timeout);
  }
}

/**
 * Opens puppeteer and generates a screenshot. Stores content in output file.
 * 
 * @param output output file
 * @returns frame data as Buffer
 */
async function frame(output) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  if (argv.width && argv.height) {
    await page.setViewport({width: argv.width, height: argv.height})
  }
  else {
    await page.setViewport({width: 960, height: 720})
  }

  // Set color scheme
  await page.emulateMediaFeatures([{name: "prefers-color-scheme", value: argv.color === "dark" ? "dark" : "light"}]);

  // Wait for page to render before taking the screenshot
  await page.goto(argv.url, { waitUntil: "networkidle0", timeout: 60000});

  // Get screenshot as image buffer, defaults to PNG format
  let data = await page.screenshot();

  await page.close();
  await browser.close();

  return data;
}

/**
 * Generates a video using output frames and ffmpeg. Image frames are deleted after
 * the video is generated. This method assumes ffmpeg is executable from the default PATH.
 */
async function video() {
  let command = "ffmpeg -framerate 0.5 -pattern_type glob -i '%s' \
                -vf 'mpdecimate,setpts=N/FRAME_RATE/TB,pad=ceil(iw/2)*2:ceil(ih/2)*2' \
                -pix_fmt yuv420p %s";
 
  let files = path.join(argv.output, "*.png");
  let encoding = argv.encoding || "mp4";
  let output = path.join(argv.output, moment().format("YYYY-MM-DD_HHmmss") + "." + encoding);
  command = util.format(command, files, output);

  // Execute ffmpeg conversion
  await exec(command).then(async () => {
    // Remove in progress frame files
    for (let x = 0; x < frames.length; x++) {
      await unlink(frames[x])
    }

    log(util.format("Wrote video %s and reset frames", output))
  })
}

async function execute() {
  try {
    // Initialize and run process
    await init();
    run();
  }
  catch (error) {
    log("Execution FAILED - " + error);
  }
}

execute();
