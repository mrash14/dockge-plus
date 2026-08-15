import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    // Add user_type column to user table
    // Default 'admin' ensures backward compatibility — existing users retain full access
    await knex.schema.alterTable("user", (table) => {
        table.string("user_type", 50).notNullable().defaultTo("admin");
    });

    // Create user_stack_access table for per-stack access control
    await knex.schema.createTable("user_stack_access", (table) => {
        table.increments("id");
        table.integer("user_id").unsigned().notNullable()
            .references("id").inTable("user").onDelete("CASCADE");
        table.string("stack_name", 255).notNullable();        // stack name or "*" for all
        table.string("endpoint", 255).notNullable().defaultTo("");  // agent endpoint, "" for local, "*" for all
        table.string("access_level", 50).notNullable().defaultTo("viewer"); // viewer, operator, manager
        table.unique([ "user_id", "stack_name", "endpoint" ]);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("user_stack_access");
    await knex.schema.alterTable("user", (table) => {
        table.dropColumn("user_type");
    });
}
