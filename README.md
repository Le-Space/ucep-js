# @le-space/ucep

Reference implementation of the **Universal Connectivity Extension Protocol (UCEP)**, wire revision 2: one libp2p peer offers an _extension_ – named commands – and others discover it, call it, and pair with it for the commands that need permission.

Spec: [Le-Space/ucep-spec](https://github.com/Le-Space/ucep-spec) (Working Draft). This library follows it and passes its test vectors.

- **Provider**: serves an extension on `/uc/extension/{id}/{version}`, answers the manifest, runs commands, checks grants and scopes, keeps idempotent results, refuses answers too large for a relayed connection.
- **Consumer**: finds extensions through identify (never through pubsub), keeps a catalogue with online / withdrawn / offline status, adds providers by PeerId, multiaddr or provider link, calls commands.
- **Pairing**: with an invitation (QR code or link, `web+ucep:pair?…`, HMAC proof bound to both PeerIds), or in-band over libp2p (commit and reveal, the same six-digit code on both screens, the provider's human approves). Optional DID binding: `did:key` Ed25519 or P-256, signed directly or by a passkey (WebAuthn).
- Plain JavaScript (ESM, JSDoc), libp2p 3, WebCrypto only: runs in browsers and in Node 22+.

How it runs between peers, step by step, and the extensions in use today: [docs/sequences.md](docs/sequences.md).

## Provider

```js
import { createProvider } from '@le-space/ucep';

const provider = createProvider({
	libp2p,
	manifest: {
		id: 'invoice',
		name: 'Rechnungen',
		version: '0.1.0',
		scopes: [{ name: 'invoice:eigenbeleg:create', description: 'Eigenbelege erstellen' }]
	},
	commands: {
		help: { handler: () => ({ commands: ['help', 'create-eigenbeleg'] }) },
		'create-eigenbeleg': {
			scope: 'invoice:eigenbeleg:create',
			idempotent: true,
			handler: async ({ argsJson, grant }) => ({ number: 'EB-2026-001' })
		}
	}
});
await provider.start();

// Invitation: show `uri` as a QR code
const { uri } = await provider.createInvitation({ scopes: ['invoice:eigenbeleg:create'] });

// In-band: open a window, show the code, let the human type what the other app shows
provider.openPairingWindow();
provider.events.addEventListener('pairing:pending', ({ detail }) => {
	// detail: { mode, id, peerId, label, did, scopes, sas }
});
await provider.approve(id, { code: typedByHuman });
```

## Consumer

```js
import { createConsumer } from '@le-space/ucep';

const consumer = createConsumer({ libp2p, label: 'Belege, Laptop' });
await consumer.start();

await consumer.addProvider(pastedPeerIdOrLink); // lists what the provider serves
await consumer.pairWithInvitation(scannedText); // or:
await consumer.pairInBand(peerId, 'invoice', {
	scopes: ['invoice:eigenbeleg:create'],
	onCode: showBig
});

const result = await consumer.call(peerId, 'invoice', 'create-eigenbeleg', { reason: '…' });
```

Through a relay (two browsers), the consumer reuses the connection it has: libp2p would open a new relayed connection for every call, and a provider refuses more than five a second from the relay's address. Once a minute per peer it lets libp2p dial anyway, which may come back direct (WebRTC).

Grants and the catalogue live in memory by default; pass `store` with your own key-value stores to keep them across restarts (the spec asks for it, together with a stable libp2p key).

## Tests

```bash
npm test
```

- the spec's test vectors (invitation URI, transcripts, proofs, codes, DID signatures);
- DID binding with fresh Ed25519 and P-256 keys, including a passkey assertion;
- two and three real libp2p nodes over the in-memory transport (Noise, Yamux, identify): discovery and manifest, scopes and error codes, idempotency, both pairing modes, a DID bound and a DID faked, revocation and unpairing, a provider going offline and an extension withdrawn.

## Protobuf

`src/pb/messages.proto` is a copy of the spec's; `npm run generate` rebuilds `src/pb/messages.js` (protons, then esbuild).

## License

MIT
