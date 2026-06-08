export function isStudyCoachEnabled() {
  return process.env.STUDY_COACH_ENABLED !== "false";
}

export function getStudyUnlockRequirements(options = {}) {
  const maxMessagesPerAssignment =
    options.maxMessagesPerAssignment ??
    Math.max(10, Number(process.env.STUDY_MAX_MESSAGES || 80));

  return {
    minQualifiedStudySeconds: Math.max(60, Number(process.env.STUDY_UNLOCK_MIN_SECONDS || 1800)),
    minSecondsPerOnTopicMessage: Math.max(15, Number(process.env.STUDY_MIN_SECONDS_PER_ON_TOPIC_MESSAGE || 45)),
    maxSecondsPerGap: Math.max(60, Number(process.env.STUDY_MAX_GAP_SECONDS || 300)),
    maxMessagesPerAssignment,
  };
}

export function accumulateQualifiedStudySeconds(progress, { onTopic, now = new Date() }) {
  const requirements = getStudyUnlockRequirements();
  const existing = Number(progress?.qualified_study_seconds || 0);

  if (!onTopic) {
    return existing;
  }

  const timestamp = now.toISOString();
  const lastQualifiedAt = progress?.last_qualified_at || progress?.session_started_at;
  let addition = requirements.minSecondsPerOnTopicMessage;

  if (lastQualifiedAt) {
    const lastMs = Date.parse(lastQualifiedAt);
    const nowMs = now.getTime();
    if (Number.isFinite(lastMs) && Number.isFinite(nowMs) && nowMs > lastMs) {
      const gapSeconds = Math.floor((nowMs - lastMs) / 1000);
      addition = Math.max(
        requirements.minSecondsPerOnTopicMessage,
        Math.min(gapSeconds, requirements.maxSecondsPerGap),
      );
    }
  }

  return existing + addition;
}

export function isQuizUnlocked(progress) {
  if (!isStudyCoachEnabled()) {
    return true;
  }
  if (progress?.quiz_unlocked_at) {
    return true;
  }
  const requirements = getStudyUnlockRequirements();
  const qualifiedSeconds = Number(progress?.qualified_study_seconds || 0);
  return qualifiedSeconds >= requirements.minQualifiedStudySeconds;
}

export function getUnlockProgress(progress) {
  const requirements = getStudyUnlockRequirements();
  const qualifiedSeconds = Number(progress?.qualified_study_seconds || 0);
  const minQualifiedStudySeconds = requirements.minQualifiedStudySeconds;
  const percent = minQualifiedStudySeconds
    ? Math.min(100, Math.round((qualifiedSeconds / minQualifiedStudySeconds) * 100))
    : 100;

  return {
    qualifiedStudySeconds: qualifiedSeconds,
    minQualifiedStudySeconds,
    onTopicMessageCount: Number(progress?.on_topic_message_count || 0),
    percentComplete: percent,
    unlocked: isQuizUnlocked(progress),
    unlockedAt: progress?.quiz_unlocked_at || null,
  };
}
