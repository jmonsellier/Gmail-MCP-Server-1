#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from 'googleapis';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import open from 'open';
import os from 'os';
import { createDraft } from './drafts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), '.gmail-mcp');
const OAUTH_PATH = process.env.GMAIL_OAUTH_PATH || path.join(CONFIG_DIR, 'gcp-oauth.keys.json');
const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH || path.join(CONFIG_DIR, 'credentials.json');

// OAuth2 configuration
let oauth2Client: OAuth2Client;

// Schema definitions
const SendEmailSchema = z.object({
    to: z.array(z.string()).describe("List of recipient email addresses"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body content"),
    cc: z.array(z.string()).optional().describe("List of CC recipients"),
    bcc: z.array(z.string()).optional().describe("List of BCC recipients"),
});

const CreateDraftSchema = z.object({
    message: z.object({
        to: z.array(z.string()).optional().describe("Email addresses of recipients"),
        subject: z.string().optional().describe("Subject of the email"),
        body: z.string().optional().describe("Body content of the email")
    })
});

const ReadEmailSchema = z.object({
    messageId: z.string().describe("ID of the email message to retrieve"),
});

const SearchEmailsSchema = z.object({
    query: z.string().describe("Gmail search query (e.g., 'from:example@gmail.com')"),
    maxResults: z.number().optional().describe("Maximum number of results to return"),
});

const ModifyEmailSchema = z.object({
    messageId: z.string().describe("ID of the email message to modify"),
    labelIds: z.array(z.string()).describe("List of label IDs to apply"),
});

const DeleteEmailSchema = z.object({
    messageId: z.string().describe("ID of the email message to delete"),
});

// ... [keep all the existing functions like loadCredentials, authenticate, etc.]

// Main function
async function main() {
    await loadCredentials();

    if (process.argv[2] === 'auth') {
        await authenticate();
        console.log('Authentication completed successfully');
        process.exit(0);
    }

    // Initialize Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Server implementation
    const server = new Server({
        name: "gmail",
        version: "1.0.0",
        capabilities: {
            tools: {},
        },
    });

    // Tool handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: "create_draft",
                description: "Creates a new email draft",
                inputSchema: zodToJsonSchema(CreateDraftSchema),
            },
            {
                name: "send_email",
                description: "Sends a new email",
                inputSchema: zodToJsonSchema(SendEmailSchema),
            },
            {
                name: "read_email",
                description: "Retrieves the content of a specific email",
                inputSchema: zodToJsonSchema(ReadEmailSchema),
            },
            {
                name: "search_emails",
                description: "Searches for emails using Gmail search syntax",
                inputSchema: zodToJsonSchema(SearchEmailsSchema),
            },
            {
                name: "modify_email",
                description: "Modifies email labels (move to different folders)",
                inputSchema: zodToJsonSchema(ModifyEmailSchema),
            },
            {
                name: "delete_email",
                description: "Permanently deletes an email",
                inputSchema: zodToJsonSchema(DeleteEmailSchema),
            },
        ],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            switch (name) {
                case "create_draft": {
                    const validatedArgs = CreateDraftSchema.parse(args);
                    const response = await createDraft(oauth2Client, validatedArgs);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Draft created successfully with ID: ${response.id}`,
                            },
                        ],
                    };
                }

                case "send_email": {
                    const validatedArgs = SendEmailSchema.parse(args);
                    const message = [
                        'From: me',
                        `To: ${validatedArgs.to.join(', ')}`,
                        validatedArgs.cc ? `Cc: ${validatedArgs.cc.join(', ')}` : '',
                        validatedArgs.bcc ? `Bcc: ${validatedArgs.bcc.join(', ')}` : '',
                        `Subject: ${validatedArgs.subject}`,
                        '',
                        validatedArgs.body
                    ].filter(Boolean).join('\r\n');

                    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

                    const response = await gmail.users.messages.send({
                        userId: 'me',
                        requestBody: {
                            raw: encodedMessage,
                        },
                    });

                    return {
                        content: [
                            {
                                type: "text",
                                text: `Email sent successfully with ID: ${response.data.id}`,
                            },
                        ],
                    };
                }

                // ... [keep all other existing cases]

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: ${error.message}`,
                    },
                ],
            };
        }
    });

    const transport = new StdioServerTransport();
    server.connect(transport);
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
