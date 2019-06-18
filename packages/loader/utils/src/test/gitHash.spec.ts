/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { gitHashFile } from "..";

async function getFileContents(p: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        // Disabling due to being test utility method
        // tslint:disable-next-line:non-literal-fs-path
        fs.readFile(p, (error, data) => {
            if (error) {
                reject(error);
            }
            resolve(data);
        });
    });
}

const dataDir = "../../../../server/gateway/public";

describe("Core-Utils", () => {
    // Expected hashes are from git hash-object file...
    // Make sure the hash is of the file and not of an LFS stub
    describe("#gitHashFile", () => {
        it("Windows ICON should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/favicon.ico`);
            const file = await getFileContents(p);
            const expectedHash = "bfe873eb228f98720fe0ed18c638daa13906958f";
            const hash = gitHashFile(file);

            assert.equal(hash, expectedHash);
        });

        it("AKA PDF should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/images/aka.pdf`);
            const file = await getFileContents(p);
            const expectedHash = "f3423703f542852aa7f3d1a13e73f0de0d8c9c0f";
            const hash = gitHashFile(file);

            assert.equal(hash, expectedHash);
        });

        it("Clippy GIF should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/images/clippy.gif`);
            const file = await getFileContents(p);
            const expectedHash = "3ce319dee60ec493f93c7e1ac4c97470b10707fd";
            const hash = gitHashFile(file);

            assert.equal(hash, expectedHash);
        });
    });
});
