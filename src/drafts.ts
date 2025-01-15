import { google } from 'googleapis';
import { GaxiosResponse } from 'gaxios';
import { gmail_v1 } from 'googleapis/build/src/apis/gmail/v1';

interface CreateDraftParams {
  message: {
    to?: string[];
    subject?: string;
    body?: string;
  };
}

interface DraftResponse {
  id: string;
  message: {
    id: string;
    threadId: string;
  };
}

export async function createDraft(
  auth: any,
  params: CreateDraftParams
): Promise<DraftResponse> {
  const gmail = google.gmail({ version: 'v1', auth });
  
  // Construire l'email au format RFC 2822
  const {
    to = [],
    subject = '',
    body = '',
  } = params.message;

  const emailLines = [
    `To: ${to.join(', ')}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    '',
    body
  ];

  const email = emailLines.join('\r\n');

  // Encoder l'email en base64
  const encodedEmail = Buffer.from(email).toString('base64');

  try {
    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedEmail
        }
      }
    });

    return {
      id: response.data.id || '',
      message: {
        id: response.data.message?.id || '',
        threadId: response.data.message?.threadId || ''
      }
    };
  } catch (error) {
    console.error('Error creating draft:', error);
    throw new Error('Failed to create draft email');
  }
}
