"""Add resets and suggestions

Revision ID: 67fd15b09692
Revises: 1e1350dacdad
Create Date: 2026-07-05 22:42:00.039487

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '67fd15b09692'
down_revision: Union[str, None] = '1e1350dacdad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = insp.get_table_names()

    if 'service_type_resets' not in tables:
        op.create_table('service_type_resets',
        sa.Column('parent_id', sa.Integer(), nullable=False),
        sa.Column('reset_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['parent_id'], ['service_types.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reset_id'], ['service_types.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('parent_id', 'reset_id')
        )
    if 'service_type_suggestions' not in tables:
        op.create_table('service_type_suggestions',
        sa.Column('parent_id', sa.Integer(), nullable=False),
        sa.Column('suggestion_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['parent_id'], ['service_types.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['suggestion_id'], ['service_types.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('parent_id', 'suggestion_id')
        )


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = insp.get_table_names()
    if 'service_type_suggestions' in tables:
        op.drop_table('service_type_suggestions')
    if 'service_type_resets' in tables:
        op.drop_table('service_type_resets')
