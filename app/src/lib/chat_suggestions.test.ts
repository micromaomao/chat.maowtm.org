import { extractSuggestions } from "./chat_suggestions";
import { test, expect } from "@jest/globals";

test("extractSuggestions", () => {
  const test_cases = [
    {
      msg: `In terms of usefulness, I would say Computer Systems or Security.
In terms of fun, Computer Graphics was quite enjoyable. \n\
In terms of difficulty, Compilers definitely took the cake.
Suggestion welcome :)

Suggestion 1: What are your interests/hobbies?
Suggestion 2: What projects are you working on?
Suggestion 3: Do you like being a software engineer?`,
      suggestions: [
        "What are your interests/hobbies?",
        "What projects are you working on?",
        "Do you like being a software engineer?"
      ],
      message_without_suggestions: `In terms of usefulness, I would say Computer Systems or Security.
In terms of fun, Computer Graphics was quite enjoyable. \n\
In terms of difficulty, Compilers definitely took the cake.
Suggestion welcome :)`
    },
    {
      msg: "Hi",
      suggestions: [],
      message_without_suggestions: "Hi"
    },
    {
      msg: "Hi\nhi",
      suggestions: [],
      message_without_suggestions: "Hi\nhi"
    },
    {
      msg: `Hi

How is your day?

Suggestion 1: Good\n\n`,
      suggestions: ["Good"],
      message_without_suggestions: `Hi

How is your day?`
    },
    {
      msg: `Suggestion 1: How's your day?
Suggestion 2: What are you up to?
Suggestion 3: What are your hobbies?`,
      suggestions: [
        "How's your day?",
        "What are you up to?",
        "What are your hobbies?"
      ],
      message_without_suggestions: ""
    },
    {
      msg: ` Suggestion 1: How's your day?
  Suggestion 2: What are you up to?
Suggestion 3: What are your hobbies?`,
      suggestions: [
        "How's your day?",
        "What are you up to?",
        "What are your hobbies?"
      ],
      message_without_suggestions: ""
    },
    {
      msg: `Hello, nice to meet you.
Suggestion 1:
How's your day?
Suggestion 2:
What are you up to?
Suggestion 3:
What are your hobbies?`,
      suggestions: [
        "How's your day?",
        "What are you up to?",
        "What are your hobbies?"
      ],
      message_without_suggestions: "Hello, nice to meet you."
    },
    {
      msg: `Hello, nice to meet you. Suggestion 1: How's your day?
Suggestion 2: What are you up to?
Suggestion 3: What are your hobbies?`,
      suggestions: [
        "How's your day?",
        "What are you up to?",
        "What are your hobbies?"
      ],
      message_without_suggestions: "Hello, nice to meet you."
    },
    {
      msg: `Hello, nice to meet you.
 Suggestion 1: How's your day?
Suggestion 2: What are you up to?
Suggestion 3: What are your hobbies?`,
      suggestions: [
        "How's your day?",
        "What are you up to?",
        "What are your hobbies?"
      ],
      message_without_suggestions: "Hello, nice to meet you."
    },
  ];

  for (let test_case of test_cases) {
    for (let [msg_variant, expected_msg] of [
      [test_case.msg, test_case.message_without_suggestions],
      [test_case.msg + "\n", test_case.message_without_suggestions],
      [test_case.msg.replace(/\n+/g, "\n"), test_case.message_without_suggestions.replace(/\n+/g, "\n")],
      [test_case.msg.replace(/(?<!\n)\n(?!\n)/g, "\n\n"), test_case.message_without_suggestions.replace(/(?<!\n)\n(?!\n)/g, "\n\n")],
      [test_case.msg.trim(), test_case.message_without_suggestions.trim()],
    ]) {
      expect(extractSuggestions(msg_variant)).toEqual({
        suggestions: test_case.suggestions,
        message_without_suggestions: expected_msg
      });
    }

    expect(extractSuggestions(test_case.msg.toLowerCase())).toEqual({
      suggestions: test_case.suggestions.map(s => s.toLowerCase()),
      message_without_suggestions: test_case.message_without_suggestions.toLowerCase()
    });

    expect(extractSuggestions(test_case.msg.toUpperCase())).toEqual({
      suggestions: test_case.suggestions.map(s => s.toUpperCase()),
      message_without_suggestions: test_case.message_without_suggestions.toUpperCase()
    });
  }
});
