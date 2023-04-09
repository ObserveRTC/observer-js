import fs from "fs";
import { exec } from 'child_process';

const GEN_OUTPUT = "./gen-out";
const MODELS_PROTO_PATH = "./models.proto";
const SAMPLES_PROTO_PATH = "./samples.proto";

async function createTypescriptModels(path, fileName) {
    await new Promise((resolve, reject) => {
        const command = [
            `PATH=$PATH:$(pwd)/node_modules/.bin`,
            `protoc`,
            // `./node_modules/.bin/protoc-gen-es`,
            `-I . `,
            `--es_out ${GEN_OUTPUT}`,
            `--es_opt target=ts`,
            path
        ].join(" ");
        exec(command, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve();
        });
    });
    return fs.readFileSync(
        `${GEN_OUTPUT}/${fileName}`
    )
}

async function writeToNpmLib(generatedCode, fileName) {
    fs.writeFileSync(`../../src/models/${fileName}.ts`, generatedCode);
}


async function main() {
    const [modelsCode, samplesCode] = await Promise.all([
        createTypescriptModels(MODELS_PROTO_PATH, 'models_pb.ts'),
        createTypescriptModels(SAMPLES_PROTO_PATH, 'samples_pb.ts')
    ]);
    const updatedModelsCode = modelsCode.toString().replace('samples_pb.js', 'samples_pb');
    await Promise.all([
        writeToNpmLib(updatedModelsCode, 'Models'),
        writeToNpmLib(samplesCode, 'samples_pb'),
    ]);
}

main().then(() => {
    console.info("Done")
    process.exit(0);
}).catch(err => {
    console.error("Error occurred", err);
    process.exit(1);
}).finally(() => {
    
})