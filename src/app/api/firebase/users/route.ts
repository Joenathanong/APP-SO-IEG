import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { AppUser } from '@/types';

export async function GET() {
  try {
    const snapshot = await adminDb.collection('users').get();
    const users: AppUser[] = snapshot.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    } as AppUser));
    return NextResponse.json(users);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, role } = body as {
      name: string;
      email: string;
      password: string;
      role: 'administrator' | 'operator';
    };

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });

    // Create Firestore document
    const now = new Date().toISOString();
    const userData: Omit<AppUser, 'uid'> = {
      email,
      name,
      role,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    await adminDb.collection('users').doc(userRecord.uid).set(userData);

    return NextResponse.json({
      uid: userRecord.uid,
      ...userData,
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { uid, ...updates } = body as Partial<AppUser> & { uid: string };

    const updatedData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await adminDb.collection('users').doc(uid).update(updatedData);

    // If name changed, update Firebase Auth display name too
    if (updates.name) {
      await adminAuth.updateUser(uid, { displayName: updates.name });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
