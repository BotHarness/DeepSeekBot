import { describe, expect, it, vi } from 'vitest';
import { Group, Mesh, SphereGeometry } from 'three';
import { MToonMaterial } from '@pixiv/three-vrm';
import { LilToonMaterial } from '@mochiya/three-liltoon';
import { createCharacterShading } from '../src/client/shading.js';

describe('character material comparison', () => {
  it('restores the exact source materials and outline visibility without changing morphs', () => {
    const source = new MToonMaterial();
    const outline = new MToonMaterial({ isOutline: true });
    const root = new Group();
    const original = [source, outline];
    const mesh = new Mesh(new SphereGeometry(), original);
    mesh.morphTargetInfluences = [0.4];
    root.add(mesh);
    const shading = createCharacterShading(root);
    shading.select('liltoon');
    expect(mesh.material[0]).toBeInstanceOf(LilToonMaterial);
    expect(outline.visible).toBe(false);
    expect(mesh.morphTargetInfluences).toEqual([0.4]);
    shading.select('mtoon');
    expect(mesh.material).toBe(original);
    expect(outline.visible).toBe(true);
    shading.dispose();
    mesh.geometry.dispose();
    source.dispose();
    outline.dispose();
  });

  it('follows source expression colors and disposes only owned replacement materials', () => {
    const source = new MToonMaterial();
    const sourceDispose = vi.spyOn(source, 'dispose');
    const root = new Group();
    const mesh = new Mesh(new SphereGeometry(), source);
    root.add(mesh);
    const shading = createCharacterShading(root);
    shading.select('liltoon');
    const target = mesh.material as unknown as LilToonMaterial;
    const targetDispose = vi.spyOn(target, 'dispose');
    source.color.setRGB(0.1, 0.2, 0.3);
    source.opacity = 0.6;
    shading.update();
    expect(target.color.equals(source.color)).toBe(true);
    expect(target.opacity).toBe(0.6);
    shading.dispose();
    shading.dispose();
    expect(targetDispose).toHaveBeenCalledTimes(1);
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(mesh.material).toBe(source);
    mesh.geometry.dispose();
    source.dispose();
  });
});
