import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to get Google OAuth2 Client
export const getOAuth2Client = async () => {
    const globalConfig = await prisma.globalConfig.findFirst();

    if (!globalConfig || !globalConfig.googleClientId || !globalConfig.googleClientSecret || !globalConfig.googleRedirectUri) {
        console.error('[GoogleAuth] Missing Global Config:', globalConfig);
        throw new Error('Google Calendar integration not configured globally.');
    }

    return new google.auth.OAuth2(
        globalConfig.googleClientId,
        globalConfig.googleClientSecret,
        globalConfig.googleRedirectUri
    );
};

// Generate Auth URL
export const generateAuthUrl = async (companyId) => {
    const oauth2Client = await getOAuth2Client();

    // State can be used to pass companyId safely
    const state = JSON.stringify({ companyId });

    return oauth2Client.generateAuthUrl({
        access_type: 'offline', // Crucial for Refresh Token
        scope: [
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/calendar.readonly'
        ],
        state: state,
        prompt: 'consent' // Force consent to ensure refresh token is returned
    });
};

// Exchange Code for Token
export const handleOAuthCallback = async (code) => {
    const oauth2Client = await getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
};

// Get Authenticated Calendar Client for a Company
export const getCalendarClient = async (companyId) => {
    const config = await prisma.googleCalendarConfig.findUnique({
        where: { companyId }
    });

    if (!config || !config.refreshToken) {
        throw new Error('Google Calendar not connected for this company.');
    }

    const oauth2Client = await getOAuth2Client();
    oauth2Client.setCredentials({
        refresh_token: config.refreshToken,
        access_token: config.accessToken // Optional, will refresh if needed
    });

    // Listen to token refresh events to save new access tokens
    oauth2Client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
            await prisma.googleCalendarConfig.update({
                where: { companyId },
                data: {
                    accessToken: tokens.access_token,
                    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
                }
            });
        }
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
};

// List Calendars
export const listCalendars = async (companyId) => {
    const calendar = await getCalendarClient(companyId);
    const response = await calendar.calendarList.list();
    return response.data.items;
};

// Check Availability (FreeBusy)
export const checkAvailability = async (companyId, startTime, endTime, timeZone = 'America/Sao_Paulo') => {
    const config = await prisma.googleCalendarConfig.findUnique({ where: { companyId } });
    if (!config) throw new Error('Calendar config not found');

    const calendar = await getCalendarClient(companyId);

    const calendarId = config.primaryCalendarId || 'primary';

    const response = await calendar.freebusy.query({
        requestBody: {
            timeMin: startTime,
            timeMax: endTime,
            timeZone: timeZone,
            items: [{ id: calendarId }]
        }
    });

    return response.data.calendars[calendarId].busy;
};

// Create Event
export const createCalendarEvent = async (companyId, eventDetails) => {
    const config = await prisma.googleCalendarConfig.findUnique({ where: { companyId } });
    const calendar = await getCalendarClient(companyId);

    const calendarId = config.primaryCalendarId || 'primary';

    const event = {
        summary: eventDetails.summary,
        description: eventDetails.description,
        start: {
            dateTime: eventDetails.startTime,
            timeZone: config.timezone || 'America/Sao_Paulo',
        },
        end: {
            dateTime: eventDetails.endTime,
            timeZone: config.timezone || 'America/Sao_Paulo',
        },
        attendees: eventDetails.attendees || [], // [{email: 'user@example.com'}]
        reminders: {
            useDefault: false,
            overrides: [
                { method: 'email', minutes: 24 * 60 },
                { method: 'popup', minutes: 30 },
            ],
        },
    };

    const response = await calendar.events.insert({
        calendarId: calendarId,
        requestBody: event,
    });

    return response.data;
};
