"use client";



import Link from "next/link";

import { dataHostingSignupHint } from "../lib/data-hosting.js";



export default function TermsAcceptanceField({ checked, onChange, id = "accept-terms" }) {

  return (

    <div className="field terms-acceptance-field">

      <label className="checkbox-row" htmlFor={id}>

        <input

          checked={checked}

          id={id}

          name="acceptedTerms"

          onChange={onChange}

          required

          type="checkbox"

        />

        <span>

          I agree to the{" "}

          <Link href="/legal/terms" rel="noopener noreferrer" target="_blank">

            Terms and Conditions

          </Link>{" "}

          and{" "}

          <Link href="/legal/privacy" rel="noopener noreferrer" target="_blank">

            Privacy Policy

          </Link>

          .

        </span>

      </label>

      <p className="muted field-hint">{dataHostingSignupHint()}</p>

    </div>

  );

}

