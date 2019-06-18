/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Simple helper script to generate a production compose file that includes a versioned docker image
const fs = require("fs");

const composeFile = process.argv[2];

const compose =
`version: '3'
services:
    text-analytics:
        image: ${composeFile}`;

console.log(compose);

fs.writeFile(process.argv[3], compose, () => {});
