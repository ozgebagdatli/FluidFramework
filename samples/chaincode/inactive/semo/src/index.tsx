/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChaincode } from "@prague/runtime-definitions";
import { DataStore } from "@prague/datastore";
import { SemoApp } from "./semo-app";

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
  return DataStore.instantiate(new SemoApp());
}
