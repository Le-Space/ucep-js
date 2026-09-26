// SPDX-License-Identifier: MIT
// UCEP: the Universal Connectivity Extension Protocol, wire revision 2.
// Spec: https://github.com/Le-Space/ucep-spec

export { createProvider } from './provider.js';
export { createConsumer } from './consumer.js';
export {
	UCEP_VERSION,
	LIMITS,
	TIMEOUTS,
	UcepError,
	compatible,
	isScope,
	parseProtocolId,
	protocolId
} from './protocol.js';
export {
	encodeInvitation,
	encodeProviderLink,
	parseInvitation,
	parseProviderInput,
	wrapInLink
} from './links.js';
export {
	inBandTranscript,
	invitationTranscript,
	pairingProof,
	shortAuthString,
	transcriptHash
} from './transcript.js';
export { parseDidKey, verifyDidProof } from './did.js';
export { memoryStore } from './store.js';
export { ext as messages } from './pb/messages.js';
