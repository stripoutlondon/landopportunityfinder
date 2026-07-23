import assert from "node:assert/strict";
import test from "node:test";

import { scorePropertyIdentityMatch } from "../lib/atlas/property-identity-match";

test("scores an address and postcode match highly", () => {
  const score = scorePropertyIdentityMatch({
    requestedAddress: "18-22 King Street",
    requestedPostcode: "M2 6AG",
    candidateAddress: "18-22 King Street",
    candidatePostcode: "M2 6AG",
    evidenceConfidence: 90,
    titleNumber: "MAN1234",
  });

  assert.ok(score >= 85);
});

test("does not overstate a postcode-only match", () => {
  const score = scorePropertyIdentityMatch({
    requestedAddress: "1 Market Street",
    requestedPostcode: "M2 6AG",
    candidateAddress: "99 Deansgate",
    candidatePostcode: "M2 6AG",
    evidenceConfidence: 50,
  });

  assert.ok(score < 40);
});
