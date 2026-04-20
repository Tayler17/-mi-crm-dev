import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Team } from './team.entity';

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team) private readonly repo: Repository<Team>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async findAll(tenantId: string) {
    const teams = await this.repo.find({ where: { tenantId }, order: { name: 'ASC' } });
    return Promise.all(teams.map(async (t) => {
      const members = await this.getMembers(t.id, tenantId);
      return { ...t, memberCount: members.length, members };
    }));
  }

  async findOne(id: string, tenantId: string) {
    const t = await this.repo.findOne({ where: { id, tenantId } });
    if (!t) throw new NotFoundException('Team not found');
    const members = await this.getMembers(id, tenantId);
    return { ...t, members };
  }

  async create(dto: any, tenantId: string, userId?: string) {
    const team = this.repo.create({ tenantId, name: dto.name, description: dto.description, color: dto.color ?? '#6366f1', createdBy: userId });
    return this.repo.save(team);
  }

  async update(id: string, dto: any, tenantId: string) {
    const team = await this.repo.findOne({ where: { id, tenantId } });
    if (!team) throw new NotFoundException('Team not found');
    if (dto.name !== undefined) team.name = dto.name;
    if (dto.description !== undefined) team.description = dto.description;
    if (dto.color !== undefined) team.color = dto.color;
    if (dto.isActive !== undefined) team.isActive = dto.isActive;
    return this.repo.save(team);
  }

  async remove(id: string, tenantId: string) {
    const team = await this.repo.findOne({ where: { id, tenantId } });
    if (!team) throw new NotFoundException('Team not found');
    await this.repo.remove(team);
  }

  // ── Members ───────────────────────────────────────────────────────────────────

  async getMembers(teamId: string, tenantId: string) {
    return this.db.query(
      `SELECT tm.user_id, tm.role, tm.joined_at,
              u.full_name, u.email, u.role AS user_role
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1 AND u.tenant_id = $2
       ORDER BY u.full_name`,
      [teamId, tenantId],
    );
  }

  async addMember(teamId: string, userId: string, role: string, tenantId: string) {
    await this.findOne(teamId, tenantId);
    await this.db.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (team_id, user_id) DO UPDATE SET role = $3`,
      [teamId, userId, role ?? 'agent'],
    );
    return { ok: true };
  }

  async removeMember(teamId: string, userId: string, tenantId: string) {
    await this.findOne(teamId, tenantId);
    await this.db.query(
      `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, userId],
    );
    return { ok: true };
  }

  async getAvailableUsers(teamId: string, tenantId: string) {
    return this.db.query(
      `SELECT u.id, u.full_name, u.email, u.role
       FROM users u
       WHERE u.tenant_id = $1
         AND u.id NOT IN (SELECT user_id FROM team_members WHERE team_id = $2)
       ORDER BY u.full_name`,
      [tenantId, teamId],
    );
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────

  async getStats(teamId: string, tenantId: string) {
    await this.findOne(teamId, tenantId);
    const [stats] = await this.db.query(
      `SELECT
         COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'open') AS open_conversations,
         COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'resolved') AS resolved_today,
         COUNT(DISTINCT tm.user_id) AS agents
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id
       LEFT JOIN conversations c ON c.team_id = t.id
       WHERE t.id = $1`,
      [teamId],
    );
    return {
      openConversations: parseInt(stats.open_conversations, 10),
      resolvedToday: parseInt(stats.resolved_today, 10),
      agents: parseInt(stats.agents, 10),
    };
  }
}
