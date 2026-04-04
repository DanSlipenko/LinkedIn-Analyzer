/**
 * Create the precise criteria/prompt for DeepSeek.
 */
function createCriteria() {
  return `
You are an expert content analyzer reviewing website data structures.
I am going to provide you with a JSON block. I need you to determine if this block represents or contains the main header navigation of the Moody Bible Institute website.
The ideal website header contains the following 19 navigation items:
Top Menu Items: Moody, Education, Radio, Publishers, Today In the Word, Conferences, Alumni, Donate, My Apps, My.Moody, Apply Now.
Main Menu Items: MOODY Bible Institute, About, Academics, Undergraduate, Graduate, Online, Aviation, More.

Your specific requirement is to flag any JSON block that contains AT LEAST 40% of this specific header information (approx. 7-8 of the keywords listed above) within its values, text, or link descriptors.

Respond strictly with a JSON object in the following format:
{
  "matches": boolean, // true if it contains >= 40% of the header info keywords, otherwise false
  "confidence": number, // 0-100 score estimating how strongly it matches
  "reasoning": "A concise 1-sentence explanation of why it matched or didn't"
}
Ensure the output is valid JSON mapped directly to these keys. Do not include markdown code block syntax (like \`\`\`json) in your answer, return just the raw JSON object.
`;
}

/**
 * Send the block to DeepSeek API with prompt criteria.
 */
async function processWithDeepSeek(block, apiKey) {
  const criteria = createCriteria();
  const endpoint = "https://api.deepseek.com/chat/completions";

  // For very large blocks, you might want to truncate JSON representation to save tokens
  const blockString = JSON.stringify(block);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat", // standard DeepSeek text model
        messages: [
          { role: "system", content: criteria },
          { role: "user", content: `Here is the JSON block to evaluate:\n\n${blockString}` },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content.trim();
    
    // Safety check just in case DeepSeek returns markdown fencing despite instructions
    if (content.startsWith("\`\`\`json")) {
        content = content.replace(/^\`\`\`json\n/, "").replace(/\n\`\`\`$/, "");
    } else if (content.startsWith("\`\`\`")) {
        content = content.replace(/^\`\`\`\n/, "").replace(/\n\`\`\`$/, "");
    }

    const result = JSON.parse(content);
    return {
      blockID: block["ID$$number"],
      isMatch: result.matches,
      confidence: result.confidence,
      reasoning: result.reasoning,
      originalBlock: block,
    };
  } catch (error) {
    console.error(`=> Error processing block ID ${block["ID$$number"]}:`, error.message);
    // Return false on error so we don't crash the whole run
    return { blockID: block["ID$$number"], isMatch: false, error: error.message };
  }
}

module.exports = { createCriteria, processWithDeepSeek };
