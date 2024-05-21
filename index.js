import { readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import OpenAI from 'openai';

const model = 'tts-1';
const voice = 'nova';
const format = 'aac';

const INPUT_LIMIT = 4096;

async function run() {
    const file = resolve(process.cwd(), 'input.txt');
    if (!existsSync(file)) {
        throw new Error('input.txt does not exist');
    }

    const fullInput = await readFile(file, 'utf-8');

    const sentences = fullInput
        .replace(/([.?!])\s*(?=[A-Z])/g, '$1|')
        .split('|');

    const generatedFiles = [];

    const totalCharacters = fullInput.length;
    let charactersSent = 0;

    const chunks = [];
    const numberOfSentences = sentences.length;

    // split into chunks of <= 4096 characters
    while (sentences.length > 0) {
        let input = '';

        while (
            sentences.length > 0 &&
            input.length + sentences[0].length < INPUT_LIMIT
        ) {
            input += sentences.shift() + ' ';
        }

        chunks.push(input);
    }

    console.log(
        'full input has %d sentences and will be sent in %d chunks.',
        numberOfSentences,
        chunks.length,
    );

    // start generating audio
    for (let i = 0; i < chunks.length; i += 1) {
        const input = chunks[i];
        charactersSent += input.length;

        console.log(
            'sending chunk #%d with %d characters (%d of %d total characters done)',
            i,
            input.length,
            charactersSent,
            totalCharacters,
        );

        const openai = new OpenAI();
        const audio = await openai.audio.speech.create({
            model,
            voice,
            input,
            response_format: format,
        });

        // write to tmp file
        const tmpFile = resolve(process.cwd(), `tmp_output_${i}.${format}`);
        await writeFile(tmpFile, Buffer.from(await audio.arrayBuffer()));

        generatedFiles.push(tmpFile);

        console.log('audio #%d created', i);
    }

    // concat files, if necessary
    const finalFile = resolve(process.cwd(), `output.${format}`);

    if (generatedFiles.length > 1) {
        console.log('concatenating %d files', generatedFiles.length);

        // concat using ffmpeg
        await spawnSync('ffmpeg', [
            '-i',
            `concat:${generatedFiles.join('|')}`,
            '-c',
            'copy',
            finalFile,
        ]);

        // remove tmp files
        await spawnSync('rm', generatedFiles);
    } else {
        // only 1 file => just rename it
        await rename(generatedFiles[0], finalFile);
    }

    return finalFile;
}

run().then(
    (output) => console.log(`Done: ${output}`),
    (error) => {
        console.error(error.message);
        console.error(error.stack);
        process.exit(1);
    },
);
