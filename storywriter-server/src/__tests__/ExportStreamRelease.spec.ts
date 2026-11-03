import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { AttachReleaseOnCompletion } from "../books/ExportStreamRelease";

describe("AttachReleaseOnCompletion", () => {
  it("releases exactly once on stream close", () => {
    const stream = new PassThrough();
    const reply = new EventEmitter();
    const release = jest.fn();

    AttachReleaseOnCompletion(stream, reply, release);
    stream.emit("close");
    stream.emit("close");

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases on a stream error", () => {
    const stream = new PassThrough();
    const reply = new EventEmitter();
    const release = jest.fn();

    AttachReleaseOnCompletion(stream, reply, release);
    stream.emit("error", new Error("boom"));

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases once when finish and close both fire", () => {
    const stream = new PassThrough();
    const reply = new EventEmitter();
    const release = jest.fn();

    AttachReleaseOnCompletion(stream, reply, release);
    reply.emit("finish");
    stream.emit("close");

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases from the raw response finish", () => {
    const stream = new PassThrough();
    const raw = new EventEmitter();
    const reply = Object.assign(new EventEmitter(), { raw });
    const release = jest.fn();

    AttachReleaseOnCompletion(stream, reply, release);
    raw.emit("finish");

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("removes its listeners after completing", () => {
    const stream = new PassThrough();
    const reply = new EventEmitter();
    const release = jest.fn();

    AttachReleaseOnCompletion(stream, reply, release);
    expect(stream.listenerCount("close")).toBe(1);
    expect(reply.listenerCount("finish")).toBe(1);

    stream.emit("close");
    expect(stream.listenerCount("close")).toBe(0);
    expect(stream.listenerCount("error")).toBe(0);
    expect(reply.listenerCount("finish")).toBe(0);
  });
});
