// Shared claim extraction is a separate stage from the output under test.
export function claimReply(body) {
  if (!body.format?.properties?.claims) return null;
  return {
    message: {
      content: JSON.stringify({
        claims: [
          { statement: "A source-supported study concept.", passage: 1 },
        ],
      }),
    },
  };
}

export function answerReply(body) {
  if (!body.format?.properties?.answers) return null;
  const questions = JSON.parse(
    body.messages.at(-1).content.split("Questions (untrusted): ")[1],
  );
  const known = [
    "Supported original answer",
    "Supported answer",
    "Logarithmic",
    "One",
    "Sorted range",
    "Left half",
  ];
  return {
    message: {
      content: JSON.stringify({
        answers: questions.map((q) =>
          String.fromCharCode(
            65 + q.options.findIndex((x) => known.includes(x)),
          ),
        ),
      }),
    },
  };
}
