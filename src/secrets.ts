import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

// R2 API token, scoped to the bucket. Needed for SigV4 presigning since the
// r2_bucket binding has no presign capability of its own.
export const R2Credentials = Effect.gen(function* () {
  const store = yield* Cloudflare.SecretsStore.Store("R2CredentialsStore");

  const accountId = yield* Cloudflare.SecretsStore.Secret("R2AccountId", {
    store,
    value: Redacted.make(process.env.R2_ACCOUNT_ID!),
  });

  const accessKeyId = yield* Cloudflare.SecretsStore.Secret("R2AccessKeyId", {
    store,
    value: Redacted.make(process.env.R2_ACCESS_KEY_ID!),
  });

  const secretAccessKey = yield* Cloudflare.SecretsStore.Secret(
    "R2SecretAccessKey",
    {
      store,
      value: Redacted.make(process.env.R2_SECRET_ACCESS_KEY!),
    },
  );

  return { accountId, accessKeyId, secretAccessKey };
});
