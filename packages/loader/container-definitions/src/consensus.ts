/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISequencedClient } from "./clients";

/**
 * Proposal to set the given key/value pair.
 *
 * Consensus on the proposal is achieved if the MSN is \>= the sequence number
 * at which the proposal is made and no client within the collaboration window rejects
 * the proposal.
 */
export interface IProposal {
    // The key for the proposal
    key: string;

    // The value of the proposal
    value: any;
}

/**
 * Similar to IProposal except includes the sequence number when it was made in addition to the fields on IProposal
 */
export type ISequencedProposal = { sequenceNumber: number } & IProposal;

/**
 * Adds the sequence number at which the message was approved to an ISequencedProposal
 */
export type IApprovedProposal = { approvalSequenceNumber: number } & ISequencedProposal;

/**
 * Adds the sequence number at which the message was committed to an IApprovedProposal
 */
export type ICommittedProposal = { commitSequenceNumber: number } & IApprovedProposal;

export interface IRejection {
    // The sequence number of the proposal being rejected
    sequenceNumber: number;
}

export interface IPendingProposal extends ISequencedProposal {
    reject();
}

/**
 * Class representing agreed upon values in a quorum
 */
export interface IQuorum extends EventEmitter {
    propose(key: string, value: any): Promise<void>;

    has(key: string): boolean;

    get(key: string): any;

    getMembers(): Map<string, ISequencedClient> | undefined;

    getMember(clientId: string): ISequencedClient | undefined;
}
