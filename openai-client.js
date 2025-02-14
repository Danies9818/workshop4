const OpenAI = require('openai');

class OpenAIClient {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }
        
        this.openai = new OpenAI({
            apiKey: apiKey
        });
    }

    /**
     * Generates a text completion using OpenAI's API
     * @param {string} prompt - The input text to generate completion for
     * @param {Object} options - Optional parameters for the completion
     * @param {number} options.maxTokens - Maximum tokens in the response (default: 100)
     * @param {number} options.temperature - Randomness of the output (0-2, default: 0.7)
     * @param {string} options.model - Model to use (default: 'gpt-3.5-turbo')
     * @returns {Promise<string>} The generated completion text
     */
    async generateCompletion(prompt, options = {}) {
        try {
            const {
                maxTokens = 100,
                temperature = 0.7,
                model = 'gpt-3.5-turbo'
            } = options;

            const completion = await this.openai.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: model,
                max_tokens: maxTokens,
                temperature: temperature,
            });

            return completion.choices[0].message.content;
        } catch (error) {
            console.error('OpenAI API Error:', error);
            throw new Error('Failed to generate completion: ' + error.message);
        }
    }

    /**
     * Generates multiple completions for the same prompt
     * @param {string} prompt - The input text to generate completions for
     * @param {number} numCompletions - Number of completions to generate
     * @param {Object} options - Optional parameters for the completions
     * @returns {Promise<string[]>} Array of generated completions
     */
    async generateMultipleCompletions(prompt, numCompletions = 1, options = {}) {
        try {
            const completions = [];
            for (let i = 0; i < numCompletions; i++) {
                const completion = await this.generateCompletion(prompt, options);
                completions.push(completion);
            }
            return completions;
        } catch (error) {
            console.error('OpenAI API Error:', error);
            throw new Error('Failed to generate multiple completions: ' + error.message);
        }
    }
}

module.exports = OpenAIClient; 