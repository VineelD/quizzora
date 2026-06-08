"use client";

import { useEffect, useRef, useState } from "react";
import { loginAction } from "../app/actions/auth.js";
import TermsAcceptanceField from "./TermsAcceptanceField.jsx";

const FETCH_TIMEOUT_MS = 30000;

function networkErrorMessage(error) {
  if (error?.name === "AbortError") {
    return "Request timed out. Check your connection and try again.";
  }
  if (error?.message === "Failed to fetch" || error?.message === "Load failed") {
    return "Network error. On mobile data, wait a moment and try again.";
  }
  return error?.message || "Something went wrong.";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      credentials: options.credentials || "include",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function MessageBox({ message }) {
  if (!message) {
    return null;
  }

  const isError =
    message.includes("Invalid") ||
    message.includes("error") ||
    message.includes("closed") ||
    message.includes("Network") ||
    message.includes("timed out");
  return <div className={`message ${isError ? "error" : ""}`}>{message}</div>;
}

function WizardHeader({ eyebrow = "Secure portal", title, description }) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {description ? <p className="muted">{description}</p> : null}
    </div>
  );
}

function WizardOption({ title, description, onClick }) {
  return (
    <button className="auth-wizard-option" onClick={onClick} type="button">
      <span className="auth-wizard-option-title">{title}</span>
      {description ? <span className="auth-wizard-option-desc">{description}</span> : null}
    </button>
  );
}

function WizardBack({ onClick, label = "Back" }) {
  return (
    <p className="muted auth-wizard-back">
      <button className="link-button" onClick={onClick} type="button">
        {label}
      </button>
    </p>
  );
}

function TenantCodeField({ id, label, value, onChange, hint, required = false }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        autoComplete="off"
        id={id}
        onChange={onChange}
        placeholder="e.g. A1B2C3D4"
        required={required}
        spellCheck={false}
        type="text"
        value={value}
      />
      {hint ? <p className="muted field-hint">{hint}</p> : null}
    </div>
  );
}

function resolveFormMeta({ intent, portalType, registerKind, userContext }) {
  if (intent === "signin") {
    if (userContext === "platform") {
      return {
        title: "Platform sign in",
        description: "Sign in with your super admin or support email and password. No school or family code is needed.",
        codeLabel: "",
        codeHint: null,
      };
    }
    if (userContext === "student") {
      return {
        title: "Student sign in",
        description: "Use the school or family code your teacher or parent gave you, plus your username and password.",
        codeLabel: "School or family code",
        codeHint: "Optional unless you use the same password in more than one school or family.",
      };
    }
    if (portalType === "family") {
      return {
        title: "Family sign in",
        description: "Enter your family code if you have one, then your email or username and password.",
        codeLabel: "Family code",
        codeHint: "Optional unless you use the same password in more than one family or school.",
      };
    }
    return {
      title: "School sign in",
      description: "Enter your school code if you have one, then your email or username and password.",
      codeLabel: "School code",
      codeHint: "Optional unless you use the same password in more than one school or family.",
    };
  }

  if (intent === "forgot") {
    if (userContext === "platform") {
      return {
        title: "Reset platform password",
        description: "Enter the email on your super admin or support account. We will send a reset link.",
        codeLabel: "",
        codeHint: null,
      };
    }
    if (userContext === "student") {
      return {
        title: "Reset your password",
        description: "Enter your school or family code and the email on your account. We will send a reset link.",
        codeLabel: "School or family code",
        codeHint: null,
      };
    }
    return {
      title: "Reset your password",
      description:
        "Enter the email on your account. If you use the same email for a school and a family account, we reset the password for the portal you selected above.",
      codeLabel: portalType === "family" ? "Family code" : "School code",
      codeHint: "Only needed if your email is registered in more than one school or family.",
    };
  }

  if (portalType === "family") {
    if (registerKind === "school") {
      return {
        title: "Register your family",
        description: "Create your family workspace and parent administrator account.",
        codeLabel: "Family code",
        codeHint: null,
      };
    }
    return {
      title: "Join your family",
      description: "Your family administrator will share an 8-character family code with you.",
      codeLabel: "Family code",
      codeHint: "Find this in the family portal under your administrator account.",
    };
  }

  if (registerKind === "school") {
    return {
      title: "Register your school",
      description: "Create a new school workspace and your administrator account.",
      codeLabel: "School code",
      codeHint: null,
    };
  }

  return {
    title: "Join your school",
    description: "Your school administrator will give you an 8-character school code.",
    codeLabel: "School code",
    codeHint: "Find this in the admin console under your school administrator.",
  };
}

export default function AuthForm({ authError = "", signedOut = false }) {
  const [step, setStep] = useState(authError ? "form" : "welcome");
  const [intent, setIntent] = useState(authError ? "signin" : "");
  const [userContext, setUserContext] = useState("");
  const [portalType, setPortalType] = useState("school");
  const [registerKind, setRegisterKind] = useState("join");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tenantCode, setTenantCode] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [message, setMessage] = useState(authError);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!signedOut) {
      return;
    }
    setStep("welcome");
    setIntent("");
    setUserContext("");
    setMessage("You have been signed out.");
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/");
    }
  }, [signedOut]);

  function resetToWelcome() {
    setStep("welcome");
    setIntent("");
    setUserContext("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    setAcceptedTerms(false);
  }

  function chooseIntent(nextIntent) {
    setIntent(nextIntent);
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    setAcceptedTerms(false);
    if (nextIntent === "forgot") {
      setStep("context");
      return;
    }
    setStep("context");
  }

  function chooseContext(context) {
    setUserContext(context);
    setMessage("");

    if (context === "school") {
      setPortalType("school");
    } else if (context === "family") {
      setPortalType("family");
    }

    if (intent === "register" && (context === "student" || context === "platform")) {
      setStep(context === "platform" ? "platform-info" : "student-info");
      return;
    }

    if (intent === "register") {
      setStep("setup-kind");
      return;
    }

    setStep("form");
  }

  function chooseSetupKind(kind) {
    setRegisterKind(kind);
    setMessage("");
    setStep("form");
  }

  async function handleClientSubmit(event) {
    event.preventDefault();
    if (submittingRef.current || loading) {
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setMessage("");

    try {
      if (intent === "forgot") {
        const response = await fetchWithTimeout("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            portalType: userContext === "platform" ? "" : portalType,
            schoolCode: portalType === "school" || userContext === "student" ? tenantCode : "",
            familyCode: portalType === "family" || userContext === "student" ? tenantCode : "",
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Could not send reset email.");
        }
        setMessage(payload.message);
        return;
      }

      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      if (intent === "register" && !acceptedTerms) {
        throw new Error("You must agree to the Terms and Conditions to create an account.");
      }

      const endpoint =
        portalType === "family"
          ? registerKind === "school"
            ? "/api/auth/register-family"
            : "/api/auth/register-join-family"
          : registerKind === "school"
            ? "/api/auth/register-school"
            : "/api/auth/register-join";

      const body =
        portalType === "family"
          ? registerKind === "school"
            ? { familyName: tenantName, familySlug: tenantSlug, name, email, password, acceptedTerms: true }
            : { familyCode: tenantCode, name, email, password, acceptedTerms: true }
          : registerKind === "school"
            ? { schoolName: tenantName, schoolSlug: tenantSlug, name, email, password, acceptedTerms: true }
            : { schoolCode: tenantCode, name, email, password, acceptedTerms: true };

      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Registration failed.");
      }

      if (payload.checkoutUrl) {
        window.location.assign(payload.checkoutUrl);
        return;
      }

      if (payload.user?.role === "parent") {
        window.location.assign("/family");
        return;
      }
      window.location.assign(payload.user?.role === "admin" ? "/admin" : "/teacher");
    } catch (error) {
      setMessage(networkErrorMessage(error));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  const formMeta = resolveFormMeta({ intent, portalType, registerKind, userContext });
  const showNewOrgFields = intent === "register" && registerKind === "school";
  const showJoinCodeField =
    (intent === "forgot" && userContext !== "platform") ||
    (intent === "register" && registerKind === "join") ||
    (intent === "signin" && userContext !== "student" && userContext !== "platform");
  const showStudentCodeField = intent === "signin" && userContext === "student";

  if (step === "welcome") {
    return (
      <div className="login-card auth-wizard">
        <WizardHeader
          description="Sign in, set up your school or family, or reset your password. We will ask a few quick questions and show only the fields you need."
          title="Welcome"
        />
        <MessageBox message={message} />
        <button className="button primary" onClick={() => setStep("intent")} type="button">
          Get started
        </button>
      </div>
    );
  }

  if (step === "intent") {
    return (
      <div className="login-card auth-wizard">
        <WizardHeader
          description="Choose the option that best matches what you are trying to do right now."
          title="What would you like to do?"
        />
        <div className="auth-wizard-options">
          <WizardOption
            description="I already have an account and want to open my portal."
            onClick={() => chooseIntent("signin")}
            title="Sign in"
          />
          <WizardOption
            description="Register a new school or family, or join with an access code."
            onClick={() => chooseIntent("register")}
            title="Set up a new account"
          />
          <WizardOption
            description="Send a password reset link to my email."
            onClick={() => chooseIntent("forgot")}
            title="Reset my password"
          />
        </div>
        <WizardBack onClick={resetToWelcome} />
      </div>
    );
  }

  if (step === "context") {
    const contextTitle =
      intent === "forgot"
        ? "Which account needs a reset?"
        : intent === "register"
          ? "Who are you setting up for?"
          : "Who are you signing in as?";
    const contextDescription =
      intent === "forgot"
        ? "This helps us ask for the right school or family code."
        : intent === "register"
          ? "We will guide you through the right registration steps."
          : "We will tailor the sign-in form to your role.";

    return (
      <div className="login-card auth-wizard">
        <WizardHeader description={contextDescription} title={contextTitle} />
        <div className="auth-wizard-options">
          <WizardOption
            description="Administrator or teacher at a school."
            onClick={() => chooseContext("school")}
            title="School educator"
          />
          <WizardOption
            description="Parent or guardian running learning at home."
            onClick={() => chooseContext("family")}
            title="Family / homeschool"
          />
          <WizardOption
            description="I need to complete quizzes and assignments."
            onClick={() => chooseContext("student")}
            title="Student"
          />
          {intent !== "register" ? (
            <WizardOption
              description="Super admin or support staff managing schools and families on the platform."
              onClick={() => chooseContext("platform")}
              title="Platform administrator"
            />
          ) : null}
        </div>
        <WizardBack onClick={() => setStep("intent")} />
      </div>
    );
  }

  if (step === "student-info") {
    return (
      <div className="login-card auth-wizard">
        <WizardHeader
          description="Ask your teacher or parent to create your account and share your login details. Once you have them, you can sign in from here."
          title="Student accounts are created for you"
        />
        <button
          className="button primary"
          onClick={() => {
            setIntent("signin");
            setUserContext("student");
            setStep("form");
          }}
          type="button"
        >
          Go to student sign in
        </button>
        <WizardBack onClick={() => setStep("context")} />
      </div>
    );
  }

  if (step === "platform-info") {
    return (
      <div className="login-card auth-wizard">
        <WizardHeader
          description="Super admin and support accounts are created by your organization's platform owner. If you already have credentials, sign in from the platform administrator path."
          title="Platform accounts are provisioned for you"
        />
        <button
          className="button primary"
          onClick={() => {
            setIntent("signin");
            setUserContext("platform");
            setStep("form");
          }}
          type="button"
        >
          Go to platform sign in
        </button>
        <WizardBack onClick={() => setStep("context")} />
      </div>
    );
  }

  if (step === "setup-kind") {
    const isFamily = portalType === "family";
    return (
      <div className="login-card auth-wizard">
        <WizardHeader
          description={
            isFamily
              ? "Are you starting a new family workspace or joining one that already exists?"
              : "Are you registering a new school or joining one that already exists?"
          }
          title={isFamily ? "How are you joining?" : "How is your school set up?"}
        />
        <div className="auth-wizard-options">
          <WizardOption
            description={
              isFamily
                ? "I am the first parent setting up our family account."
                : "I am the school administrator setting up our school."
            }
            onClick={() => chooseSetupKind("school")}
            title={isFamily ? "Register a new family" : "Register a new school"}
          />
          <WizardOption
            description={
              isFamily
                ? "Another parent already created our family — I have the family code."
                : "My school already uses Quizzora — I have a school code."
            }
            onClick={() => chooseSetupKind("join")}
            title={isFamily ? "Join an existing family" : "Join an existing school"}
          />
        </div>
        <WizardBack onClick={() => setStep("context")} />
      </div>
    );
  }

  if (intent === "signin") {
    return (
      <form action={loginAction} className="login-card auth-wizard" method="post" suppressHydrationWarning>
        <WizardHeader description={formMeta.description} title={formMeta.title} />
        <MessageBox message={message} />

        {showStudentCodeField ? (
          <TenantCodeField
            hint={formMeta.codeHint}
            id="login-tenant-code"
            label={formMeta.codeLabel}
            onChange={(event) => setTenantCode(event.target.value.toUpperCase())}
            value={tenantCode}
          />
        ) : showJoinCodeField ? (
          <TenantCodeField
            hint={formMeta.codeHint}
            id="login-tenant-code"
            label={formMeta.codeLabel}
            onChange={(event) => setTenantCode(event.target.value.toUpperCase())}
            value={tenantCode}
          />
        ) : null}

        <input name="schoolCode" type="hidden" value={tenantCode} />

        <div className="field">
          <label htmlFor="auth-identifier">Email or username</label>
          <input autoComplete="username" id="auth-identifier" name="identifier" required spellCheck={false} type="text" />
        </div>

        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input autoComplete="current-password" id="auth-password" minLength={8} name="password" required type="password" />
        </div>

        <button className="button primary" type="submit">
          Sign in
        </button>
        <WizardBack
          label="Start over"
          onClick={() => {
            resetToWelcome();
          }}
        />
      </form>
    );
  }

  return (
    <form className="login-card auth-wizard" onSubmit={handleClientSubmit} autoComplete="off" suppressHydrationWarning>
      <fieldset disabled={loading} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
        <WizardHeader description={formMeta.description} title={formMeta.title} />
        <MessageBox message={message} />

        {showNewOrgFields ? (
          <>
            <div className="field">
              <label htmlFor="tenant-name">{portalType === "family" ? "Family name" : "School name"}</label>
              <input
                id="tenant-name"
                onChange={(event) => setTenantName(event.target.value)}
                required
                type="text"
                value={tenantName}
              />
            </div>
            <div className="field">
              <label htmlFor="tenant-slug">{portalType === "family" ? "Family URL (slug)" : "School URL (slug)"}</label>
              <input
                id="tenant-slug"
                onChange={(event) => setTenantSlug(event.target.value)}
                placeholder={portalType === "family" ? "davuluri-family" : "riverside-high"}
                required
                spellCheck={false}
                type="text"
                value={tenantSlug}
              />
              <p className="muted field-hint">Letters, numbers, and hyphens only.</p>
            </div>
          </>
        ) : null}

        {intent === "register" && registerKind === "join" ? (
          <TenantCodeField
            hint={formMeta.codeHint}
            id="register-tenant-code"
            label={formMeta.codeLabel}
            onChange={(event) => setTenantCode(event.target.value.toUpperCase())}
            required
            value={tenantCode}
          />
        ) : null}

        {intent === "forgot" ? (
          <TenantCodeField
            hint={formMeta.codeHint}
            id="forgot-tenant-code"
            label={formMeta.codeLabel}
            onChange={(event) => setTenantCode(event.target.value.toUpperCase())}
            required={userContext === "student"}
            value={tenantCode}
          />
        ) : null}

        {intent !== "forgot" ? (
          <div className="field">
            <label htmlFor="register-name">Full name</label>
            <input
              autoComplete="name"
              id="register-name"
              onChange={(event) => setName(event.target.value)}
              required
              type="text"
              value={name}
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input
            autoComplete="email"
            id="auth-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            spellCheck={false}
            type="email"
            value={email}
          />
        </div>

        {intent !== "forgot" ? (
          <>
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <input
                autoComplete="new-password"
                id="auth-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            <div className="field">
              <label htmlFor="auth-confirm-password">Confirm password</label>
              <input
                autoComplete="new-password"
                id="auth-confirm-password"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </div>
          </>
        ) : null}

        {intent === "register" ? (
          <TermsAcceptanceField
            checked={acceptedTerms}
            id="register-accept-terms"
            onChange={(event) => setAcceptedTerms(event.target.checked)}
          />
        ) : null}

        <button className="button primary" type="submit">
          {loading
            ? "Working..."
            : intent === "forgot"
              ? "Send reset link"
              : registerKind === "school"
                ? portalType === "family"
                  ? "Create family"
                  : "Create school"
                : portalType === "family"
                  ? "Create parent account"
                  : "Create teacher account"}
        </button>

        <WizardBack
          label="Start over"
          onClick={() => {
            resetToWelcome();
          }}
        />
      </fieldset>
    </form>
  );
}
