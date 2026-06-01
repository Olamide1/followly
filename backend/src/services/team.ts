import { pool } from '../database/connection';
import { createError } from '../middleware/errorHandler';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export async function resolveTeamUserIds(userId: number): Promise<number[]> {
  const userResult = await pool.query(
    'SELECT team_id FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length > 0 && userResult.rows[0].team_id) {
    const teamResult = await pool.query(
      'SELECT id FROM users WHERE team_id = $1',
      [userResult.rows[0].team_id]
    );
    return teamResult.rows.map((r: any) => r.id);
  }

  return [userId];
}

export class TeamService {
  async createTeam(userId: number, name: string) {
    // Check user is not already in a team
    const userResult = await pool.query(
      'SELECT team_id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows[0]?.team_id) {
      throw createError('You are already in a team', 400);
    }

    // Create team
    const teamResult = await pool.query(
      `INSERT INTO teams (name, owner_id)
       VALUES ($1, $2)
       RETURNING *`,
      [name, userId]
    );

    const team = teamResult.rows[0];

    // Update user with team_id and owner role
    await pool.query(
      'UPDATE users SET team_id = $1, team_role = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [team.id, 'owner', userId]
    );

    return team;
  }

  async getTeam(userId: number) {
    const userResult = await pool.query(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]?.team_id) {
      return null;
    }

    const teamId = userResult.rows[0].team_id;

    const teamResult = await pool.query(
      'SELECT * FROM teams WHERE id = $1',
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return null;
    }

    const team = teamResult.rows[0];

    // Get members
    const membersResult = await pool.query(
      'SELECT id, email, name, team_role, created_at FROM users WHERE team_id = $1 ORDER BY team_role DESC, created_at ASC',
      [teamId]
    );

    // Get pending invitations
    const invitationsResult = await pool.query(
      `SELECT id, email, role, status, created_at, expires_at
       FROM team_invitations
       WHERE team_id = $1 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC`,
      [teamId]
    );

    return {
      ...team,
      members: membersResult.rows,
      invitations: invitationsResult.rows,
    };
  }

  async inviteMember(userId: number, email: string) {
    // Verify user is team owner
    const userResult = await pool.query(
      'SELECT team_id, team_role, name FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]?.team_id || userResult.rows[0].team_role !== 'owner') {
      throw createError('Only team owners can invite members', 403);
    }

    const teamId = userResult.rows[0].team_id;
    const inviterName = userResult.rows[0].name || 'A team member';

    // Get team name
    const teamResult = await pool.query(
      'SELECT name FROM teams WHERE id = $1',
      [teamId]
    );
    const teamName = teamResult.rows[0]?.name || 'the team';

    // Check if email is already a team member
    const existingMember = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND team_id = $2',
      [email.toLowerCase(), teamId]
    );

    if (existingMember.rows.length > 0) {
      throw createError('This user is already a team member', 400);
    }

    // Check for pending invitation
    const existingInvite = await pool.query(
      `SELECT id FROM team_invitations
       WHERE team_id = $1 AND email = $2 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP`,
      [teamId, email.toLowerCase()]
    );

    if (existingInvite.rows.length > 0) {
      throw createError('An invitation has already been sent to this email', 400);
    }

    // Generate invite token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000); // 7 days

    // Create invitation
    const inviteResult = await pool.query(
      `INSERT INTO team_invitations (team_id, email, token, role, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [teamId, email.toLowerCase(), token, 'member', userId, expiresAt]
    );

    return {
      invitation: inviteResult.rows[0],
      teamName,
      inviterName,
      token,
    };
  }

  async cancelInvitation(userId: number, invitationId: number) {
    const userResult = await pool.query(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]?.team_id || userResult.rows[0].team_role !== 'owner') {
      throw createError('Only team owners can cancel invitations', 403);
    }

    const result = await pool.query(
      `UPDATE team_invitations SET status = 'cancelled'
       WHERE id = $1 AND team_id = $2 AND status = 'pending'
       RETURNING *`,
      [invitationId, userResult.rows[0].team_id]
    );

    if (result.rows.length === 0) {
      throw createError('Invitation not found', 404);
    }

    return result.rows[0];
  }

  async removeMember(ownerId: number, memberUserId: number) {
    const ownerResult = await pool.query(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [ownerId]
    );

    if (!ownerResult.rows[0]?.team_id || ownerResult.rows[0].team_role !== 'owner') {
      throw createError('Only team owners can remove members', 403);
    }

    if (ownerId === memberUserId) {
      throw createError('Cannot remove yourself from the team', 400);
    }

    const teamId = ownerResult.rows[0].team_id;

    // Verify member is in the same team
    const memberResult = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND team_id = $2',
      [memberUserId, teamId]
    );

    if (memberResult.rows.length === 0) {
      throw createError('Member not found in your team', 404);
    }

    // Reassign member's data to the team owner
    const tables = ['contacts', 'lists', 'campaigns', 'automations', 'email_queue', 'suppression_list', 'provider_configs', 'tags', 'custom_fields', 'warmup_schedules', 'domain_reputation'];
    for (const table of tables) {
      await pool.query(
        `UPDATE ${table} SET user_id = $1 WHERE user_id = $2`,
        [ownerId, memberUserId]
      );
    }

    // Remove from team
    await pool.query(
      'UPDATE users SET team_id = NULL, team_role = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [memberUserId]
    );

    return { success: true };
  }

  async leaveTeam(userId: number) {
    const userResult = await pool.query(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]?.team_id) {
      throw createError('You are not in a team', 400);
    }

    if (userResult.rows[0].team_role === 'owner') {
      throw createError('Team owners cannot leave. Transfer ownership or delete the team first.', 400);
    }

    const teamId = userResult.rows[0].team_id;

    // Get team owner for data reassignment
    const ownerResult = await pool.query(
      `SELECT id FROM users WHERE team_id = $1 AND team_role = 'owner'`,
      [teamId]
    );

    if (ownerResult.rows.length > 0) {
      const ownerId = ownerResult.rows[0].id;
      const tables = ['contacts', 'lists', 'campaigns', 'automations', 'email_queue', 'suppression_list', 'provider_configs', 'tags', 'custom_fields', 'warmup_schedules', 'domain_reputation'];
      for (const table of tables) {
        await pool.query(
          `UPDATE ${table} SET user_id = $1 WHERE user_id = $2`,
          [ownerId, userId]
        );
      }
    }

    // Remove from team
    await pool.query(
      'UPDATE users SET team_id = NULL, team_role = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );

    return { success: true };
  }

  async getInviteInfo(token: string) {
    const result = await pool.query(
      `SELECT ti.email, ti.status, ti.expires_at, t.name as team_name, u.name as inviter_name
       FROM team_invitations ti
       JOIN teams t ON t.id = ti.team_id
       LEFT JOIN users u ON u.id = ti.invited_by
       WHERE ti.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      throw createError('Invitation not found', 404);
    }

    const invite = result.rows[0];
    const isValid = invite.status === 'pending' && new Date(invite.expires_at) > new Date();

    return {
      email: invite.email,
      teamName: invite.team_name,
      inviterName: invite.inviter_name,
      valid: isValid,
    };
  }

  async acceptInvite(token: string, name: string, password: string) {
    // Get invitation
    const inviteResult = await pool.query(
      `SELECT ti.*, t.name as team_name
       FROM team_invitations ti
       JOIN teams t ON t.id = ti.team_id
       WHERE ti.token = $1 AND ti.status = 'pending' AND ti.expires_at > CURRENT_TIMESTAMP`,
      [token]
    );

    if (inviteResult.rows.length === 0) {
      throw createError('Invalid or expired invitation', 400);
    }

    const invite = inviteResult.rows[0];

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id, team_id FROM users WHERE email = $1',
      [invite.email]
    );

    let user;

    if (existingUser.rows.length > 0) {
      // User exists - add to team
      if (existingUser.rows[0].team_id) {
        throw createError('You are already in a team. Leave your current team first.', 400);
      }

      await pool.query(
        'UPDATE users SET team_id = $1, team_role = $2, name = COALESCE($3, name), updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [invite.team_id, 'member', name || null, existingUser.rows[0].id]
      );

      const userResult = await pool.query(
        'SELECT id, email, name, company, team_id, team_role FROM users WHERE id = $1',
        [existingUser.rows[0].id]
      );
      user = userResult.rows[0];
    } else {
      // New user - create account
      if (!password || password.length < 8) {
        throw createError('Password must be at least 8 characters', 400);
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const newUser = await pool.query(
        `INSERT INTO users (email, password_hash, name, team_id, team_role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, company, team_id, team_role`,
        [invite.email, passwordHash, name, invite.team_id, 'member']
      );

      user = newUser.rows[0];
    }

    // Mark invitation as accepted
    await pool.query(
      `UPDATE team_invitations SET status = 'accepted' WHERE id = $1`,
      [invite.id]
    );

    return user;
  }
}
